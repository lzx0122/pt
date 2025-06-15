import { exp } from "three/tsl";
import { calcSteps } from "./PTlib";

export class obj {
  name = "";
  steps = [];
  color = 0x000000;
  _entitySize = { length: 1, width: 1 };
  collistionScope = { length: 1, width: 1 };
  _speed = 10;
  startPoint;
  endPoint;

  constructor({ name, color, steps, startPoint, endPoint, speed, entitySize }) {
    this.name = name;
    this.color = color;
    this.startPoint = startPoint;
    this.endPoint = endPoint;
    this._entitySize = entitySize;
    this.speed = speed;
    this.steps =
      steps ||
      calcSteps({ startPoint, endPoint, speed, isRandom: name != "car" });
  }

  setCollistionScope() {
    let expand = 0;
    if (this.name == "car") {
      let span = 1;
      if (this._speed > 50) {
        expand += span * 6;
      } else if (this._speed > 40) {
        expand += span * 5;
      } else if (this._speed > 30) {
        expand += span * 4;
      } else if (this._speed > 20) {
        expand += span * 3;
      } else if (this._speed > 10) {
        expand += span * 2;
      } else {
        expand = 1;
      }
    }

    this.collistionScope = {
      length: this._entitySize.length + expand,
      width: this._entitySize.width + expand,
    };
  }

  /**
   * @param {{ length: number; width: number; }} value
   */
  set entitySize(value) {
    this._entitySize = value;
    this.setCollistionScope();
  }

  get entitySize() {
    return this._entitySize;
  }

  /**
   * @param {any} value
   */
  set speed(value) {
    this._speed = value;
    this.steps = calcSteps({
      startPoint: this.startPoint,
      endPoint: this.endPoint,
      speed: value,
      isRandom: this.name != "car",
    });
    this.setCollistionScope();
  }
  get speed() {
    return this._speed;
  }
}
