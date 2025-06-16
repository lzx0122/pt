import * as THREE from "three";
import { obj } from "./obj.js";
import { config } from "./config.js";
import { checkCollision, shouldWarn } from "./PTlib.js";
let text = document.querySelector("#text");
let makerTemps = [];
let elapsedTime = 0;
let isPlaying = false;
let isPlayCollision = false;

// 初始化場景
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  100,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 加入燈光
const light = new THREE.HemisphereLight(0xffffff, 0x444444);
scene.add(light);

// 建立格子地板
const gridHelper = new THREE.GridHelper(20, 20, 0x888888, 0x444444);
//gridHelper.rotation.x = Math.PI / 2; // YZ 平面 → XY 平面
scene.add(gridHelper);

// 建立地面參考格線（每個整數格子）
function createFloorTiles() {
  for (let x = -10; x <= 10; x++) {
    for (let z = -10; z <= 10; z++) {
      const boxGeo = new THREE.BoxGeometry(0.95, 0.01, 0.95);
      const boxMat = new THREE.MeshBasicMaterial({ color: 0xe0e0e0 });
      const tile = new THREE.Mesh(boxGeo, boxMat);
      tile.position.set(x, 0, z);
      scene.add(tile);
    }
  }
}
createFloorTiles();

// 模擬的座標資料
let carSpeed = parseInt(document.querySelector("#speed").value);

let ped1 = new obj({
  name: "行人1",
  color: 0x013220,
  speed: 3,
  startPoint: { x: 5, z: 2 },
  endPoint: { x: -5, z: -5 },
  entitySize: { length: 0.5, width: 0.5 },
});

let car = new obj({
  name: "car",
  color: 0x007bff,
  speed: carSpeed,
  startPoint: { x: -10, z: -1 },
  endPoint: { x: 10, z: -1 },
  entitySize: { length: 3, width: 2 },
});

// 更新car碰撞橢圓範圍
function updateCarCollisionScope(carObj) {
  const v_mps = (carObj.speed * 1000) / 3600; // 車速 m/s
  const semiMajorAxis = v_mps * config.params.t_safety; // 橢圓半長軸
  const semiMinorAxis = (config.params.w_car + 2 * config.params.m) / 2; // 橢圓半短軸
  carObj.collistionScope = {
    length: semiMajorAxis * 2,
    width: semiMinorAxis * 2,
  };
}
updateCarCollisionScope(car);
let peds = [ped1];

// 相機模式管理
let cameraMode = "FPP";
setFPP();
function setFPP() {
  camera.rotation.set(0, 0, 0);
  camera.position.set(car.startPoint.x, 1, car.startPoint.z);
  camera.rotateY(-Math.PI / 2);
  camera.rotateX(-20 * (Math.PI / 180));
}

function setTPP() {
  camera.rotation.set(0, 0, 0);
  camera.position.set(0, 15, 0);
  camera.rotateY(-Math.PI / 2);
  camera.rotateX(-90 * (Math.PI / 180));
}

// 畫線
function drawLine(point1, point2, color = 0x178bfd) {
  let extension = 0; // 延長線段的長度
  const distance = new THREE.Vector2(point1.x, point1.z).distanceTo(
    new THREE.Vector2(point2.x, point2.z)
  );

  // 計算方向向量並標準化
  const direction = new THREE.Vector2(
    point2.x - point1.x,
    point2.z - point1.z
  ).normalize();

  // 延長線段兩端
  const extendedPoint1 = new THREE.Vector3(
    point1.x - direction.x * extension,
    point1.y,
    point1.z - direction.y * extension
  );
  const extendedPoint2 = new THREE.Vector3(
    point2.x + direction.x * extension,
    point2.y,
    point2.z + direction.y * extension
  );

  const extendedDistance = distance + extension * 2;

  // 創建扁平的幾何體
  const geometry = new THREE.PlaneGeometry(0.2, extendedDistance);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
  });

  const route = new THREE.Mesh(geometry, material);

  // 計算中心點
  const center = new THREE.Vector3(
    (extendedPoint1.x + extendedPoint2.x) / 2,
    0.03,
    (extendedPoint1.z + extendedPoint2.z) / 2
  );
  route.position.copy(center);

  // 計算旋轉角度
  const angle = Math.atan2(point2.x - point1.x, point2.z - point1.z);
  route.rotation.x = -Math.PI / 2;
  route.rotation.z = angle;

  point2.line = route; // 將線段與點關聯
  scene.add(route);
  makerTemps.push(route);

  return route;
}

// 動態顯示座標點
function showTrajectory(obj, step, color = 0x00ff00) {
  if (step > 0) drawLine(obj.steps[step - 1], obj.steps[step], color);

  const point = obj.steps[step];
  const marker = new THREE.Object3D();
  marker.position.set(point.x, -0.1, point.z);
  marker.obj = obj;

  scene.add(marker);
  makerTemps.push(marker);
  return marker;
}

function getTimeByStep(step, speed, distancePerStep) {
  const speed_mps = (speed * 1000) / 3600; // km/h => m/s
  const timePerStep = distancePerStep / speed_mps; // 每 step 所花秒數
  return (step * timePerStep).toFixed(3).toString();
}

// 設置碰撞點（橢圓碰撞範圍）
function setPoint(tempPoints, maker, step) {
  // 定義橢圓的中心點和半軸
  const center = {
    x: maker.position.x,
    z: maker.position.z,
  };
  const semiMajorAxis = maker.obj.collistionScope.length / 2; // 半長軸
  const semiMinorAxis = maker.obj.collistionScope.width / 2; // 半短軸

  let timeKey = getTimeByStep(step, maker.obj.speed, config.distancePerStep);

  if (maker.obj.name === "car") {
    // 儲存車輛的橢圓碰撞範圍資訊
    tempPoints.set(timeKey, {
      carObj: {
        maker,
        collistionScope: { center, semiMajorAxis, semiMinorAxis },
      },
      pedObjs: [],
    });
  } else {
    // 檢查時間範圍內的車輛位置
    //const timeTolerance = 0.05; // 時間容差，單位秒
    //const pedTime = parseFloat(timeKey);
    for (let [carTimeKey, carPoint] of tempPoints) {
      //const carTime = parseFloat(carTimeKey);
      const isColliding = checkCollision(
        carPoint.carObj.maker.obj, // car object
        carPoint.carObj.maker.position, // car position
        maker.position // ped position
      );

      if (isColliding) {
        const pedTime = parseFloat(timeKey);
        const carTime = parseFloat(carTimeKey);

        if (Math.abs(carTime - pedTime) < 0.1) {
          carPoint.pedObjs.push({
            maker,
            collisionTime: carTime,
          });
        }
      }
      // if (Math.abs(carTime - pedTime) <= timeTolerance) {
      //   const carCollistionScope = carPoint.carObj.collistionScope;
      //   const pedHalfSize = maker.obj.entitySize.length / 2;
      //   const closestX = Math.max(
      //     center.x - pedHalfSize,
      //     Math.min(carCollistionScope.center.x, center.x + pedHalfSize)
      //   );
      //   const closestZ = Math.max(
      //     center.z - pedHalfSize,
      //     Math.min(carCollistionScope.center.z, center.z + pedHalfSize)
      //   );
      //   const dx = carCollistionScope.center.x - closestX;
      //   const dz = carCollistionScope.center.z - closestZ;
      //   const distance = Math.sqrt(dx * dx + dz * dz);
      //   const carEffectiveRadius = Math.max(
      //     carCollistionScope.semiMajorAxis,
      //     carCollistionScope.semiMinorAxis
      //   );
      //   if (distance <= carEffectiveRadius) {
      //     tempPoints.get(carTimeKey).pedObjs.push({
      //       maker,
      //       collistionScope: { center, halfSize: pedHalfSize },
      //       collisionTime: carTime, // 記錄精確的碰撞時間
      //     });
      //   }
      // }
    }
  }
}

let playPedsTemp = [];
let playCarTemp = null;

// 播放車輛動態
async function playCar(car) {
  const stepDistance = config.stepDistance || 0.1; // 每步距離
  const speed_mps = (car.speed * 1000) / 3600; // 速度 m/s
  const duration = (stepDistance / speed_mps) * 1000; // 每步持續毫秒數
  playCarTemp = car;
  isPlayCollision = false;
  for (let step = 0; step < car.steps.length; step++) {
    if (!isPlaying) break;
    const carStep = car.steps[step];

    // 繪製車子本體
    const boxGeo = new THREE.BoxGeometry(
      car.entitySize.length,
      0.02,
      car.entitySize.width
    );
    const boxMat = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      opacity: 0.5,
      transparent: true,
    });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.set(carStep.x, 0, carStep.z);
    box.name = "collisionBox";
    scene.add(box);

    // 建立一個碰撞範圍（橢圓形）
    const ellipseGeo = new THREE.CircleGeometry(1, 32); // 半徑1，32分段
    ellipseGeo.rotateX(-Math.PI / 2); // 平躺地面
    const ellipseMat = new THREE.LineBasicMaterial({
      color: 0x000000,
      linewidth: 2,
      transparent: true,
      opacity: 0.5,
    });
    const ellipse = new THREE.Mesh(ellipseGeo, ellipseMat);
    ellipse.scale.set(
      car.collistionScope.length / 2,
      0.01,
      car.collistionScope.width / 2
    );
    ellipse.position.set(carStep.x, 0.01, carStep.z);
    ellipse.name = "collisionEllipse";
    scene.add(ellipse);
    car.playCarBox = ellipse;

    playPedsTemp.forEach((v) => {
      if (!("collisionTime" in v)) {
        return;
      }
      let timeToCollision = v.collisionTime - elapsedTime / 1000;
      // let later = (v.collisionTime - elapsedTime / 1000).toFixed(1);
      if (timeToCollision > 0 && shouldWarn(timeToCollision, car.speed)) {
        document.querySelector("#warning").textContent =
          "約" + timeToCollision.toFixed(1) + "秒過後碰撞!";
      }

      const isCurrentlyColliding = checkCollision(
        car,
        car.playCarBox.position,
        v.playPedBox.position
      );

      if (isCurrentlyColliding) {
        isPlaying = false;
        isPlayCollision = true;
        makerTemps.push(playCarTemp.playCarBox, v.playPedBox, box);
        document.querySelector("#warning").textContent = "撞到了!";
      }

      // const carCenter = {
      //   x: car.playCarBox.position.x,
      //   z: car.playCarBox.position.z,
      // };
      // const pedCenter = {
      //   x: v.playPedBox.position.x,
      //   z: v.playPedBox.position.z,
      // };

      // const pedHalfSize = v.entitySize.length / 2;

      // const closestX = Math.max(
      //   pedCenter.x - pedHalfSize,
      //   Math.min(carCenter.x, pedCenter.x + pedHalfSize)
      // );
      // const closestZ = Math.max(
      //   pedCenter.z - pedHalfSize,
      //   Math.min(carCenter.z, pedCenter.z + pedHalfSize)
      // );
      // const dx = carCenter.x - closestX;
      // const dz = carCenter.z - closestZ;
      // const distance = Math.sqrt(dx * dx + dz * dz);

      // const carEffectiveRadius = Math.max(
      //   car.collistionScope.length / 2,
      //   car.collistionScope.width / 2
      // );
      // if (distance <= carEffectiveRadius) {
      //   isPlaying = false;
      //   isPlayCollision = true;
      //   makerTemps.push(playCarTemp.playCarBox);
      //   makerTemps.push(v.playPedBox);
      //   makerTemps.push(box);
      //   document.querySelector("#warning").textContent = "撞到了!";
      // }
    });
    elapsedTime += duration;
    document.querySelector("#sec").innerHTML = (elapsedTime / 1000).toFixed(1);

    if (step > 0) {
      carStep.line.material.opacity = 1; // 設置車輛軌跡透明度
    }

    if (cameraMode === "FPP") {
      camera.position.set(carStep.x, 1, carStep.z);
    }

    await new Promise((resolve) => setTimeout(resolve, duration));

    // 播放結束清除車與橢圓
    if (!isPlayCollision) {
      scene.remove(box);
      scene.remove(ellipse);
    }
  }
}

// 播放行人動態
async function playPed(ped, index) {
  const stepDistance = config.stepDistance || 0.1;
  const speed_mps = (ped.speed * 1000) / 3600;
  const duration = (stepDistance / speed_mps) * 1000;

  for (let step = 0; step < ped.steps.length; step++) {
    if (!isPlaying) break;
    const pedStep = ped.steps[step];

    // 繪製人本體
    const boxGeo = new THREE.BoxGeometry(
      ped.entitySize.length,
      0.01,
      ped.entitySize.width
    );
    const boxMat = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      opacity: 0.5,
      transparent: true,
    });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.set(pedStep.x, 0.01, pedStep.z);
    box.name = ped.name;
    scene.add(box);
    makerTemps.push(box);
    ped.playPedBox = box;
    playPedsTemp[index] = ped;

    if (step > 0) {
      pedStep.line.material.opacity = 1; // 設置行人軌跡透明度
    }

    await new Promise((resolve) => setTimeout(resolve, duration));
    // 播放結束清除車與橢圓
    if (!isPlayCollision) {
      scene.remove(box);
    }
  }
}

// 預先顯示車輛和行人的軌跡，並檢查碰撞
async function preShowTrajectory() {
  updateCarCollisionScope(car);
  let tempPoints = new Map();
  let collisions = [];
  // 顯示車輛軌跡，並設定碰撞點
  for (let step = 0; step < car.steps.length; step++) {
    const marker = showTrajectory(car, step, car.color);
    car.steps[step].maker = marker; // 步數與顯示物件關聯
    setPoint(tempPoints, marker, step);
  }

  // 顯示行人軌跡，並設定碰撞點與碰撞檢查
  for (let ped of peds) {
    let isCollision = false;
    for (let step = 0; step < ped.steps.length; step++) {
      const marker = showTrajectory(ped, step, ped.color);
      ped.steps[step].maker = marker;
      setPoint(tempPoints, marker, step);
    }
    // 整理碰撞結果
    for (let [timeKey, pointInfo] of tempPoints) {
      if (pointInfo.pedObjs.length > 0) {
        pointInfo.pedObjs.forEach((pedObj) => {
          if (pedObj.maker.obj.name === ped.name && !isCollision) {
            const collisionTime = parseFloat(pedObj.collisionTime).toFixed(1);
            ped.collisionTime = collisionTime;
            collisions.push({
              pedName: ped.name,
              collisionTime: collisionTime,
              pedObj: pedObj,
              carObj: pointInfo.carObj,
            });
            isCollision = true; // 每個行人只記錄一次最早的碰撞
          }
        });
      }
    }
    if (!isCollision) {
      delete ped.collisionTime;
    }
    // let tempPointKeys = Array.from(tempPoints.keys());
    // tempPointKeys.sort((a, b) => {
    //   a - b;
    // });

    // // 檢查是否有碰撞
    // for (let timeKey of tempPointKeys) {
    //   let collisionInfo = tempPoints.get(timeKey);
    //   if (collisionInfo.pedObjs.length >= 1) {
    //     let collisionTime = parseFloat(timeKey).toFixed(1);

    //     ped.collisionTime = collisionTime;

    //     collisionInfo.pedObjs.forEach((pedObj) => {
    //       collisions.push({
    //         pedName: pedObj.maker.obj.name,
    //         collisionTime: collisionTime,
    //         pedObj: pedObj,
    //         carObj: collisionInfo.carObj,
    //       });
    //     });

    //     isCollision = true;
    //     break;
    //   }
    // }
    // if (isCollision) continue;
    // if (!isCollision) {
    //   text.innerHTML = "";
    //   delete ped.collisionTime;
    // }
  }

  if (collisions.length > 0) {
    collisions.sort((a, b) => a.collisionTime - b.collisionTime);
    const firstCollision = collisions[0];
    const timeToCollision = parseFloat(firstCollision.collisionTime);

    if (shouldWarn(timeToCollision, car.speed)) {
      text.innerHTML = `預測將在約 ${timeToCollision} 秒後與 ${firstCollision.pedName} 發生碰撞！`;
    } else {
      text.innerHTML = `預測到碰撞，但超出警示時間範圍。`;
    }
    // car紅色碰撞區
    const carMaker = firstCollision.carObj.maker;
    const ellipseGeo = new THREE.CircleGeometry(1, 32);
    ellipseGeo.rotateX(-Math.PI / 2);
    const ellipseMat = new THREE.LineBasicMaterial({
      color: 0x800080,
      linewidth: 2,
      transparent: true,
      opacity: 0.3,
    });
    const ellipse = new THREE.Mesh(ellipseGeo, ellipseMat);
    const v_mps = (car.speed * 1000) / 3600;
    ellipse.scale.set(
      v_mps * config.params.t_safety,
      1,
      (config.params.w_car + 2 * config.params.m) / 2
    );
    ellipse.position.set(carMaker.position.x, 0.01, carMaker.position.z);
    scene.add(ellipse);
    makerTemps.push(ellipse);

    // 行人碰撞區
    const collisionPed = firstCollision.pedObj;
    const pedBoxGeo = new THREE.BoxGeometry(
      collisionPed.maker.obj.entitySize.length,
      0.02,
      collisionPed.maker.obj.entitySize.width
    );
    const pedBoxMat = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      opacity: 0.4,
      transparent: true,
    });
    const pedBox = new THREE.Mesh(pedBoxGeo, pedBoxMat);
    pedBox.position.set(
      collisionPed.maker.position.x,
      0,
      collisionPed.maker.position.z
    );
    scene.add(pedBox);
    makerTemps.push(pedBox);
  } else {
    text.innerHTML = "無碰撞";
  }
}

preShowTrajectory();

// 播放動畫
function play(car, peds) {
  elapsedTime = 0;
  isPlaying = true;
  if (cameraMode === "FPP") {
    setFPP();
  } else {
    setTPP();
  }

  playCar(car);

  peds.forEach((ped, index) => {
    playPed(ped, index);
  });
}

// 動畫渲染
function animate() {
  requestAnimationFrame(animate);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.render(scene, camera);
}

animate();

// 清除所有 marker 物件
function clearMaker() {
  makerTemps.forEach((maker) => {
    scene.remove(maker);
  });
  makerTemps = [];

  if (cameraMode.toUpperCase() === "FPP") {
    setFPP();
  } else {
    setTPP();
  }
}

// 事件監聽

// 更改視角
document.querySelector("#perspective").addEventListener("change", (e) => {
  camera.rotation.set(0, 0, 0);
  if (!e.target.checked) {
    cameraMode = "FPP";
    setFPP();
  } else {
    cameraMode = "TPP";
    setTPP();
  }
});

function restart() {
  isPlaying = false;
  document.querySelector("#warning").textContent = "";
  clearMaker();
  preShowTrajectory();
}
// 重新運行
document.querySelector("#restart").addEventListener("click", restart);

// 開始播放
document.querySelector("#start").addEventListener("click", async () => {
  restart();
  if (isPlaying) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  play(car, peds);
});

// 更改速度
document.querySelector("#speed").addEventListener("change", (e) => {
  car.speed = parseInt(e.target.value);
  clearMaker();
  preShowTrajectory();
});
