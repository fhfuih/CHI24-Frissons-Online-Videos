// 必须在DOM加载完毕以及content script加载完毕之后注入
/** * @type {HTMLVideoElement} */
var bwpVideo = document.querySelector("bwp-video");
if (bwpVideo) {
  bwpVideo.addEventListener('load', () => {
    document.querySelector("input[name=hci-bilibili-duration]").value = bwpVideo.duration;
    document.querySelector("input[name=hci-bilibili-current-time]").value = bwpVideo.currentTime;
  })

  bwpVideo.addEventListener('timeupdate', function () {
    document.querySelector("input[name=hci-bilibili-current-time]").value = bwpVideo.currentTime;
  })
}
