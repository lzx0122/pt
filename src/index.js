import * as THREE from "three";
import "bootstrap/dist/css/bootstrap.min.css";
import { obj } from "./obj.js";
import { config } from "./config.js";
import {
  checkPhysicalCollision,
  checkCollision,
  shouldWarn,
  loadModel,
} from "./PTlib.js";
let text = document.querySelector("#text");
let makerTemps = [];
let elapsedTime = 0;
let isPlaying = false;
let isPlayCollision = false;
let detailedCarModel = null;

// 儲存car原始路徑
let originalCarSteps = [];
// 煞車狀態
let isBrakingActive = false;

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
  for (let x = -20; x <= 20; x++) {
    for (let z = -20; z <= 20; z++) {
      const boxGeo = new THREE.BoxGeometry(2, 0.01, 2);
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
  modelFun: null,
});

let car = new obj({
  name: "car",
  color: 0x007bff,
  speed: carSpeed,
  startPoint: { x: -20, z: -1 },
  endPoint: { x: 20, z: -1 },
  entitySize: { length: 4.63, width: config.params.w_car },
  modelFun: loadModel("car"),
});

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
  camera.position.set(0, 20, 0);
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
  let useColor = step < 3 ? 0xffff00 : color;
  if (step > 0) drawLine(obj.steps[step - 1], obj.steps[step], useColor);

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

// 設置橢圓範圍
function setPoint(tempPoints, maker, step) {
  // 定義橢圓的中心點和半軸
  const center = {
    x: maker.position.x,
    z: maker.position.z,
  };
  const semiMajorAxis = maker.obj.collistionScope.length / 2; // 半長軸
  const semiMinorAxis = maker.obj.collistionScope.width / 2; // 半短軸

  //const timeKey = getTimeByStep(step, maker.obj.speed, config.distancePerStep);
  const timeKey = maker.obj.steps[step].time.toFixed(3).toString();
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
    const timeTolerance = 0.01;
    //const pedTime = parseFloat(timeKey);
    for (let [carTimeKey, carPoint] of tempPoints) {
      //const carTime = parseFloat(carTimeKey);

      const carTime = parseFloat(carTimeKey);
      const pedTime = parseFloat(timeKey);
      if (Math.abs(carTime - pedTime) <= timeTolerance) {
        const isColliding = checkCollision(
          carPoint.carObj.maker.obj,
          carPoint.carObj.maker.position,
          maker.position,
          maker.obj.entitySize
        );
        if (isColliding) {
          carPoint.pedObjs.push({
            maker,
            collisionTime: carTime,
          });
        }
      }
    }
  }
}

let playPedsTemp = [];
let playCarTemp = null;

// 播放車輛動態
// index.js
async function playCar(car) {
  playCarTemp = car;
  isPlayCollision = false;

  if (originalCarSteps.length === 0) {
    originalCarSteps = car.steps.map((step) => ({ ...step }));
  }

  for (let step = 0; step < car.steps.length; step++) {
    if (!isPlaying || isPlayCollision) break;
    const carStep = car.steps[step];

    // car實體
    const carBodyGeo = new THREE.BoxGeometry(
      car.entitySize.length,
      0.02,
      car.entitySize.width
    );
    const carBodyMat = new THREE.MeshBasicMaterial({
      color: car.color,
      opacity: 0.8,
      transparent: true,
    });
    const carBody = new THREE.Mesh(carBodyGeo, carBodyMat);
    carBody.position.set(carStep.x, 0.01, carStep.z);
    carBody.name = "carBody";
    scene.add(carBody);

    const carBodyModel = car.model.clone();
    carBodyModel.scale.set(
      car.entitySize.width * 0.019,
      0.05,
      car.entitySize.length * 0.005
    );
    scene.add(carBodyModel);

    carBodyModel.position.set(carStep.x, -1, carStep.z); // 設定位置

    carBodyModel.lookAt(car.endPoint.x, -1, car.endPoint.z);
    makerTemps.push(carBodyModel);

    // 預警橢圓
    const ellipseGeo = new THREE.CircleGeometry(1, 32);
    ellipseGeo.rotateX(-Math.PI / 2);
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

    let minTtc = Infinity;
    let isInWarningZone = false;
    let finalWarningMessage = "";
    let finalWarningMessageClass = "";
    playPedsTemp.forEach((ped) => {
      if (!ped.playPedBox || isPlayCollision) return;
      const isPhysicallyColliding = checkPhysicalCollision(
        carBody.position,
        car.entitySize,
        ped.playPedBox.position,
        ped.entitySize
      );

      if (isPhysicallyColliding) {
        isPlayCollision = true;
        finalWarningMessage = "碰撞發生！";
        finalWarningMessageClass = "alert-danger";
        carBody.material.color.set(0xff0000);
        makerTemps.push(carBody, ellipse, ped.playPedBox);
        return;
      }

      if (
        checkCollision(
          car,
          carBody.position,
          ped.playPedBox.position,
          ped.entitySize
        )
      ) {
        isInWarningZone = true;
        if (!ped.isWarned) {
          ped.isWarned = true;
        }
      }

      if (ped.collisionTime) {
        const timeToCollision = ped.collisionTime - elapsedTime / 1000;
        if (timeToCollision > 0 && timeToCollision < minTtc) {
          minTtc = timeToCollision;
        }
      }
    });

    // ---煞車---
    // 檢查是否觸發煞車條件
    const warningConditionMet =
      isInWarningZone && minTtc < Infinity && shouldWarn(minTtc, car);

    // 如果觸發煞車且尚未啟動煞車程序
    if (warningConditionMet && !isBrakingActive) {
      isBrakingActive = true;
      finalWarningMessage = "煞車啟動！";
      finalWarningMessageClass = "alert-danger";

      // 目前狀態
      const initialSpeed_mps = (car.speed * 1000) / 3600;
      const reactionTime_s = config.params.t_reaction;
      const brakeAccel_mps2 = config.params.a_brake;
      const distancePerStep = config.distancePerStep;

      // 取得車輛行駛方向
      const nextOriginalStep = originalCarSteps[step + 1] || carStep;
      const dx = nextOriginalStep.x - carStep.x;
      const dz = nextOriginalStep.z - carStep.z;
      const direction = new THREE.Vector2(dx, dz).normalize();

      // 2. 清除未來路徑並準備生成新路徑
      car.steps.splice(step + 1);
      let lastStep = car.steps[step];
      const newBrakingSteps = [];

      // 3. 生成反應時間路徑
      const reactionDistance = initialSpeed_mps * reactionTime_s;
      const numReactionSteps = Math.ceil(reactionDistance / distancePerStep);
      const timePerReactionStep =
        reactionDistance / numReactionSteps / initialSpeed_mps;

      for (let i = 0; i < numReactionSteps; i++) {
        const newPos = {
          x: lastStep.x + direction.x * (reactionDistance / numReactionSteps),
          z: lastStep.z + direction.y * (reactionDistance / numReactionSteps),
        };
        const newStep = {
          x: newPos.x,
          z: newPos.z,
          time: lastStep.time + timePerReactionStep,
        };
        newBrakingSteps.push(newStep);
        lastStep = newStep;
      }

      // 4. 生成減速煞車路徑
      let currentSpeed_mps = initialSpeed_mps;
      while (currentSpeed_mps > 0) {
        const v_final_sq =
          currentSpeed_mps * currentSpeed_mps -
          2 * brakeAccel_mps2 * distancePerStep;
        const v_final = v_final_sq > 0 ? Math.sqrt(v_final_sq) : 0;
        const avgSpeed = (currentSpeed_mps + v_final) / 2;
        if (avgSpeed <= 0) break;
        const timeForStep = distancePerStep / avgSpeed;

        const newPos = {
          x: lastStep.x + direction.x * distancePerStep,
          z: lastStep.z + direction.y * distancePerStep,
        };
        const newStep = {
          x: newPos.x,
          z: newPos.z,
          time: lastStep.time + timeForStep,
        };
        newBrakingSteps.push(newStep);
        lastStep = newStep;
        currentSpeed_mps = v_final;
      }

      // 標記最後一個點為終點
      if (newBrakingSteps.length > 0) {
        newBrakingSteps[newBrakingSteps.length - 1].isFinalStop = true;
      }

      // 將新生成的煞車路徑加入到車輛步驟中
      car.steps.push(...newBrakingSteps);
    }

    // 如果是煞車的最後一步，更新狀態
    if (carStep.isFinalStop) {
      isPlaying = false; // 停止模擬
      finalWarningMessage = "車輛已煞停";
      finalWarningMessageClass = "alert-success";
    }
    // ------

    if (!isPlayCollision && !isBrakingActive) {
      if (isInWarningZone) {
        finalWarningMessage = "危險：已進入預警範圍！";
        if (shouldWarn(minTtc, car)) {
          finalWarningMessage = "要煞車"; // 這裡的訊息會被上面的 "煞車啟動！" 覆蓋
        }
      } else if (minTtc < Infinity) {
        finalWarningMessage = "預計 " + minTtc.toFixed(1) + " 秒後進入警示區";
      }
      finalWarningMessageClass = "alert-warning";
    }

    if (finalWarningMessage.trim().length != 0) {
      document.querySelector(
        "#warning"
      ).innerHTML = ` <div class="position-absolute top-10 start-50 translate-middle alert ${finalWarningMessageClass} centered-alert" role="alert">
          ${finalWarningMessage}
      </div>`;
    }

    if (isPlayCollision) {
      isPlaying = false;
      continue;
    }

    elapsedTime = carStep.time * 1000;
    document.querySelector("#sec").innerHTML = (elapsedTime / 1000).toFixed(1);

    if (step > 0 && carStep.line) carStep.line.material.opacity = 1;
    if (cameraMode === "FPP") camera.position.set(carStep.x, 1, carStep.z);

    const nextStepTime =
      step + 1 < car.steps.length ? car.steps[step + 1].time * 1000 : null;

    if (nextStepTime) {
      const duration = nextStepTime - elapsedTime;
      await new Promise((resolve) => setTimeout(resolve, duration));
    }

    if (!isPlayCollision && !carStep.isFinalStop) {
      scene.remove(carBody);
      scene.remove(ellipse);
      scene.remove(carBodyModel);
    } else {
      makerTemps.push(carBody, ellipse);
    }
  }
}

// 播放行人動態
async function playPed(ped, index) {
  ped.isWarned = false;
  for (let step = 0; step < ped.steps.length; step++) {
    if (!isPlaying) break;
    const pedStep = ped.steps[step];

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

    if (step > 0) pedStep.line.material.opacity = 1;

    const nextStepTime =
      step + 1 < ped.steps.length ? ped.steps[step + 1].time * 1000 : null;
    if (nextStepTime) {
      const duration = nextStepTime - ped.steps[step].time * 1000;
      await new Promise((resolve) => setTimeout(resolve, duration));
    }

    if (!isPlayCollision && isPlaying) {
      scene.remove(box);
    }
  }
}

// 預先顯示車輛和行人的軌跡，並檢查碰撞
async function preShowTrajectory() {
  let tempPoints = new Map();
  let collisions = [];

  const stepsForPrediction =
    originalCarSteps.length > 0 && !isPlaying ? originalCarSteps : car.steps;
  for (let step = 0; step < stepsForPrediction.length; step++) {
    const marker = showTrajectory(car, step, car.color);
    stepsForPrediction[step].maker = marker;
    setPoint(tempPoints, marker, step);
  }

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
            isCollision = true;
          }
        });
      }
    }
    if (!isCollision) {
      delete ped.collisionTime;
    }
  }

  if (collisions.length > 0) {
    collisions.sort((a, b) => a.collisionTime - b.collisionTime);
    const firstCollision = collisions[0];
    const timeToCollision = parseFloat(firstCollision.collisionTime);

    text.innerHTML = `預測約 ${timeToCollision} 秒後，${firstCollision.pedName} 將進入警示區！`;

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
  isBrakingActive = false;

  if (originalCarSteps.length > 0) {
    car.steps = originalCarSteps.map((step) => ({ ...step }));
  }

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

  isBrakingActive = false;

  document.querySelector("#warning").textContent = "";
  peds.forEach((p) => (p.isWarned = false));

  if (originalCarSteps.length > 0) {
    car.steps = originalCarSteps.map((step) => ({ ...step }));
  }

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

  originalCarSteps = [];

  clearMaker();
  preShowTrajectory();
});
