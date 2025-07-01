import * as echarts from "echarts";
// var myChart = echarts.init(document.getElementById("speed_ui"));
export function speed_ui(speed) {
  document.getElementById("speed_ui").innerHTML = speed + " km/h";
  //   var option = {
  //     series: [
  //       {
  //         type: "gauge",
  //         center: ["50%", "60%"],
  //         radius: "90%",
  //         startAngle: 200,
  //         endAngle: -20,
  //         min: 0,
  //         max: 240,
  //         splitNumber: 12,
  //         progress: {
  //           show: true,
  //           width: 30,
  //           itemStyle: {
  //             color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
  //               { offset: 0, color: "#58D68D" },
  //               { offset: 0.5, color: "#F4D03F" },
  //               { offset: 1, color: "#E74C3C" },
  //             ]),
  //           },
  //         },
  //         pointer: {
  //           show: false,
  //         },
  //         axisLine: {
  //           lineStyle: {
  //             width: 30,
  //             color: [[1, "rgba(255, 255, 255, 0.1)"]],
  //           },
  //         },
  //         axisTick: {
  //           distance: -45,
  //           splitNumber: 5,
  //           lineStyle: {
  //             width: 2,
  //             color: "#999",
  //           },
  //         },
  //         splitLine: {
  //           distance: -52,
  //           length: 14,
  //           lineStyle: {
  //             width: 3,
  //             color: "#999",
  //           },
  //         },
  //         axisLabel: {
  //           distance: -20,
  //           color: "#ddd",
  //           fontSize: 18,
  //         },
  //         anchor: {
  //           show: false,
  //         },
  //         title: {
  //           show: false,
  //         },
  //         detail: {
  //           formatter: "{value}",
  //           valueAnimation: true,
  //           offsetCenter: [0, 0],
  //           fontSize: 50,
  //           fontWeight: "bolder",
  //           color: "auto",
  //         },
  //         data: [
  //           {
  //             value: speed,
  //             detail: {
  //               formatter: "{value} km/h",
  //             },
  //           },
  //         ],
  //       },
  //     ],
  //   };
  //   myChart.setOption(option);
  //   window.addEventListener("resize", function () {
  //     myChart.resize();
  //   });
}

export function updateSpeed(speed) {
  document.getElementById("speed_ui").innerHTML = speed + " km/h";
  //   if (myChart) {
  //     // 只更新需要變動的數據部分，效能最好
  //     myChart.setOption({
  //       series: [
  //         {
  //           data: [{ value: speed }],
  //         },
  //       ],
  //     });
  //   }
}
