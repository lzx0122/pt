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
  const distancePerStep = config.distancePerStep || 0.1; // 每step走的距離0.1
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
  //滑化後的座標重新計算時間
  for (let i = 1; i < smoothSteps.length; i++) {
    const prevStep = smoothSteps[i - 1];
    const currentStep = smoothSteps[i];

    const segmentDx = currentStep.x - prevStep.x;
    const segmentDz = currentStep.z - prevStep.z;
    const segmentDistance = Math.sqrt(
      segmentDx * segmentDx + segmentDz * segmentDz
    );

    const timeForSegment = segmentDistance / speedMps;

    currentStep.time = prevStep.time + timeForSegment;
  }

  smoothSteps[0] = { x: startPoint.x, z: startPoint.z, time: 0 };
  const lastStep = smoothSteps[smoothSteps.length - 1];
  smoothSteps[smoothSteps.length - 1] = {
    x: endPoint.x,
    z: endPoint.z,
    time: lastStep.time,
  };

  return smoothSteps;
}

//檢查是否碰撞
export function checkCollision(carObj, carPosition, pedPosition, pedSize) {
  const v_mps = (carObj.speed * 1000) / 3600;
  const semiMajorAxis = v_mps * config.params.t_safety;
  const semiMinorAxis = (config.params.w_car + 2 * config.params.m) / 2;

  // 考慮行人的矩形範圍
  const pedHalfLength = (pedSize?.length || 0.5) / 2;
  const pedHalfWidth = (pedSize?.width || 0.5) / 2;

  // 計算行人矩形邊界
  const pedMinX = pedPosition.x - pedHalfLength;
  const pedMaxX = pedPosition.x + pedHalfLength;
  const pedMinZ = pedPosition.z - pedHalfWidth;
  const pedMaxZ = pedPosition.z + pedHalfWidth;

  // 找到矩形上離汽車中心最近的點
  const closestX = Math.max(pedMinX, Math.min(carPosition.x, pedMaxX));
  const closestZ = Math.max(pedMinZ, Math.min(carPosition.z, pedMaxZ));

  // 計算最近點到汽車中心的距離
  const dx = closestX - carPosition.x;
  const dz = closestZ - carPosition.z;

  // 橢圓方程
  const ellipseEquation =
    Math.pow(dx / semiMajorAxis, 2) + Math.pow(dz / semiMinorAxis, 2);

  return ellipseEquation <= 1;
}

//車子和行人是否碰撞
export function checkPhysicalCollision(
  carPosition,
  carSize,
  pedPosition,
  pedSize
) {
  const carHalfLength = carSize.length / 2;
  const carHalfWidth = carSize.width / 2;
  const carMinX = carPosition.x - carHalfLength;
  const carMaxX = carPosition.x + carHalfLength;
  const carMinZ = carPosition.z - carHalfWidth;
  const carMaxZ = carPosition.z + carHalfWidth;

  const pedHalfLength = pedSize.length / 2;
  const pedHalfWidth = pedSize.width / 2;
  const pedMinX = pedPosition.x - pedHalfLength;
  const pedMaxX = pedPosition.x + pedHalfLength;
  const pedMinZ = pedPosition.z - pedHalfWidth;
  const pedMaxZ = pedPosition.z + pedHalfWidth;

  const isColliding =
    carMaxX > pedMinX &&
    carMinX < pedMaxX &&
    carMaxZ > pedMinZ &&
    carMinZ < pedMaxZ;

  return isColliding;
}

// 發出警示
export function shouldWarn(timeToCollision, carSpeedKmh) {
  const v_mps = (carSpeedKmh * 1000) / 3600;
  const warningThreshold =
    config.params.t_reaction + v_mps / config.params.a_brake; // t_reaction + v / a_brake
  return timeToCollision <= warningThreshold;
}
