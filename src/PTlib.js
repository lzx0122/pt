import { config } from "./config";

const Perlin = {
  perm: new Array(512).fill(0),
  grad: (hash, x) => {
    const h = hash & 15;
    const grad = 1 + (h & 7);
    return (h & 8 ? -grad : grad) * x;
  },
  fade: (t) => t * t * t * (t * (t * 6 - 15) + 10),
  lerp: (a, b, t) => a + t * (b - a),
  noise: function (x) {
    const X = Math.floor(x) & 255;
    x -= Math.floor(x);
    const u = this.fade(x);
    return this.lerp(
      this.grad(this.perm[X], x),
      this.grad(this.perm[X + 1], x - 1),
      u
    );
  },
  init: function () {
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = p.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i % 256];
    }
  },
};

Perlin.init();

export function calcSteps({ startPoint, endPoint, speed, isRandom }) {
  const distancePerStep = config.distancePerStep || 0.1; // 每 step 走的距離（例如 0.1 公尺）
  const speedMps = (speed * 1000) / 3600; // km/h 轉 m/s

  const dx = endPoint.x - startPoint.x;
  const dz = endPoint.z - startPoint.z;
  const totalDistance = Math.sqrt(dx * dx + dz * dz);
  const stepCount = Math.ceil(totalDistance / distancePerStep);

  const dirX = dx / totalDistance;
  const dirZ = dz / totalDistance;
  const perpX = -dirZ;
  const perpZ = dirX;

  const steps = [];

  for (let i = 0; i <= stepCount; i++) {
    const t = i / stepCount;

    const baseX = startPoint.x + dirX * distancePerStep * i;
    const baseZ = startPoint.z + dirZ * distancePerStep * i;

    let offset = 0;
    let drift = 0;

    if (isRandom) {
      const highFreq = Perlin.noise(t * 30);
      const lowFreq = Perlin.noise(t * 3 + 100);

      offset = (lowFreq - 0.5) * totalDistance * 0.06;
      offset += (highFreq - 0.5) * totalDistance * 0.01;

      drift = (Perlin.noise(t * 10 + 200) - 0.5) * distancePerStep * 0.25;
    }

    const finalX = baseX + perpX * offset + dirX * drift;
    const finalZ = baseZ + perpZ * offset + dirZ * drift;

    const time = (i * distancePerStep) / speedMps;

    steps.push({ x: finalX, z: finalZ, time });
  }

  // 平滑化處理
  const smoothSteps = steps.map((step, i, arr) => {
    if (i === 0 || i === arr.length - 1) return step;
    const prev = arr[i - 1];
    const next = arr[i + 1];
    return {
      x: (prev.x + step.x * 2 + next.x) / 4,
      z: (prev.z + step.z * 2 + next.z) / 4,
      time: step.time,
    };
  });

  // 強制起點終點一致
  smoothSteps[0] = { ...startPoint, time: 0 };
  smoothSteps[smoothSteps.length - 1] = {
    ...endPoint,
    time: totalDistance / speedMps,
  };

  return smoothSteps;
}

//檢查是否碰撞
export function checkCollision(carObj, carPosition, pedPosition) {
  const v_mps = (carObj.speed * 1000) / 3600;
  const semiMajorAxis = v_mps * config.params.t_safety; // a = v * t_safety
  const semiMinorAxis = (config.params.w_car + 2 * config.params.m) / 2; // b = (w_car + 2m) / 2

  const dx = pedPosition.x - carPosition.x; // (x - xc)
  const dz = pedPosition.z - carPosition.z; // (y - yc) z = y

  // ( (x-xc)/a )^2 + ( (y-yc)/b )^2 <= 1
  const ellipseEquation =
    Math.pow(dx / semiMajorAxis, 2) + Math.pow(dz / semiMinorAxis, 2);

  return ellipseEquation <= 1;
}

// 發出警示
export function shouldWarn(timeToCollision, carSpeedKmh) {
  const v_mps = (carSpeedKmh * 1000) / 3600;
  const warningThreshold =
    config.params.t_reaction + v_mps / config.params.a_brake; // t_reaction + v / a_brake
  return timeToCollision <= warningThreshold;
}
