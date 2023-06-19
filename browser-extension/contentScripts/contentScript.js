if (typeof browser === "undefined") {
  var browser = chrome;
}

//#region video play back utility functions
// YouTube video is always there. Content scripts are loaded after the original page is loaded.
// Bilibili sometime uses regular video, sometimes uses bwp-video. FUUUCK 屌你滷味
// For bwp-video, relevant elements will be set after the hack HTML elements are injected AND LOADED.
const videoElement = document.querySelector('video')
const bwpElement = document.querySelector('bwp-video')
const hasBwpVideo = !!bwpElement
let bwpVideoDuration = null
let bwpVideoCurrentTime = null
console.log('Content Script: using', hasBwpVideo ? 'bwp-video' : 'video', 'element', bwpElement || videoElement);

function getDuration() {
  if (videoElement) return videoElement.duration
  if (bwpVideoDuration) return parseFloat(bwpVideoDuration.value)
  return null
}
function getCurrentTime() {
  if (videoElement) return videoElement.currentTime
  if (bwpVideoCurrentTime) return parseFloat(bwpVideoCurrentTime.value)
  return null
}
//#endregion

//#region hack Bilibili video information
function insertHackDiv() {
  return new Promise((resolve) => {
    const observer = new MutationObserver((mutationsList, observer) => {
      for (const mutation of mutationsList) {
        for (const node of mutation.addedNodes) {
          if (node.id === 'hci-bilibili-hack') {
            observer.disconnect()
            resolve(node)
            return
          }
        }
      }
    });
    observer.observe(document.body, { childList: true });

    const hackDiv = document.createElement('div')
    hackDiv.style.height = 0
    hackDiv.id = 'hci-bilibili-hack'
    document.body.append(hackDiv)
  })
}

function insertHackInputs(hackDiv) {
  return new Promise((resolve) => {
    const observer = new MutationObserver((mutationsList, observer) => {
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList') {
          const biliDuration = document.querySelector('input[name=hci-bilibili-duration]')
          const biliCurrentTime = document.querySelector('input[name=hci-bilibili-current-time]')
          if (biliDuration && biliCurrentTime) {
            observer.disconnect()
            resolve()
            return
          }
        }
      }
    });
    observer.observe(hackDiv, { childList: true });

    hackDiv.innerHTML = `<input type="hidden" name="hci-bilibili-duration">
    <input type="hidden" name="hci-bilibili-current-time">
    <input type="hidden" name="hci-bilibili-current-time-change" onchange="setVideoPlay()">`
  })
}

function injectPageScript() {
  return new Promise((resolve, reject) => {
    const bScript = document.createElement("script");
    bScript.src = browser.runtime.getURL("pageScripts/bilibili.js");
    bScript.onload = () => {
      console.log("content script: bScript injected");
      resolve();
    };
    bScript.onerror = reject;
    (document.head || document.documentElement).appendChild(bScript);
  })
}

if (hasBwpVideo) {
  insertHackDiv()
    .then(insertHackInputs)
    .then(injectPageScript)
    .then(() => {
      bwpVideoDuration = document.querySelector('input[name=hci-bilibili-duration]')
      bwpVideoCurrentTime = document.querySelector('input[name=hci-bilibili-current-time]')
    });
}
//#endregion

//#region Visualization
let animation = null
const PEAK_OFFSET = {
  "1": 3,
  "2": 3,
  "3": 3,
  "4": 7,
  "5": 5,
}

const animeConfigs = {
  lighting: function (EDAValues, videoContainer) {
    const keyframes = EDAValues.map((item, index, arr) => {
      const { offset, EDA: data } = item
      const scaleFactor = 20;
      var blurRadius = data * scaleFactor;
      var spreadRadius = data * scaleFactor;
      const boxShadow = `0 0 ${spreadRadius}px ${blurRadius}px rgba(247, 180, 45, 0.5)`;
      if (index === 0) {
        return { boxShadow, duration: 0 }
      }
      const prevItem = arr[index - 1]
      const duration = (offset - prevItem.offset) * 1000
      return { boxShadow, duration }
    })
    // console.log(keyframes)
    return {
      targets: videoContainer,
      easing: 'linear',
      autoplay: false,
      keyframes,
    }
  },
  // 1 create a thermometer element at the bottom right of the container
  // 2 return an anime.js config where target is the thermometer (not the container)
  thermometer: async function (EDAValues, videoContainer) {
    const iconURL = browser.runtime.getURL('data/electricity.svg')
    // const iconURL = browser.runtime.getURL('data/flash.svg')
    const response = await fetch(iconURL);
    const svgText = await response.text();
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const error = doc.querySelector("parsererror");
    if (error) throw new Error(error.textContent);
    const svgEl = doc.querySelector('svg');
    svgEl.classList.add('hci-thermometer');
    const visContainer = getOnScreenContainer(videoContainer);
    visContainer.append(svgEl);

    const keyframes = EDAValues.map((item, index, arr) => {
      let { offset, EDA: data } = item;
      data = Math.min(1, Math.max(0.01, data));
      const mainScale = Math.pow(data, 0.7);
      const smallScale = data < 0.5 ? 0 : Math.pow((data - 0.5) * 2, 0.4);
      // const mainScale = Math.pow(data, 0.4) * 0.7 + 0.3;
      // const smallScale = data < 0.5 ? 0 : Math.pow((data - 0.5) * 2, 0.4);
      function transform(el, i) {
        return `scale(${i < 3 ? mainScale : smallScale})`;
        // return `scale(${i < 1 ? mainScale : smallScale})`;
      }
      if (index === 0) {
        return { transform, duration: 0 };
      }
      const prevItem = arr[index - 1];
      const duration = (offset - prevItem.offset) * 1000
      return { transform, duration };
    });
    return {
      targets: '.hci-thermometer .bolt',
      easing: 'easeInOutQuad',
      autoplay: false,
      keyframes,
    };
  },
  // 1 create a container for exlamation marks at the bottom right of the container
  // 2 create several exclamation marks inside the container
  // 3 return an anime.js config where targets are the exclamation marks
  // === OR: is there some particle library?
  exclamation: null,
  // 1 send an array of vibration strength data to the background script
  // 2 background script forwards to raspberry pi via fetch
  vibration: {},
}

/**
 * @param {AnimationType} type the type of visualization
 * @param {string} videoID
 * @returns {Promise<string | Error>} Resolves with null and rejects error message
 */
async function initVisualization(type, videoID) {
  // If the animation object is already initialized
  if (animation) {
    // Destroy the old animation
    destroyVisualization()
    // After the desctruction, continue to create a new animation as follow
  }

  const dataURL = browser.runtime.getURL(`data/peak_window_EDA_${videoID}.json`)
  let EDAValues = []
  try {
    const response = await fetch(dataURL)
    EDAValues = await response.json()
  } catch (err) {
    console.error(err)
  }
  // DIRTY FIX: adjust the data offset.
  // only the difference between two offsets matters, so simply slicing is possible
  const peak_offset = PEAK_OFFSET[videoID]
  const index_offset = peak_offset * 5 // 5Hz
  EDAValues = EDAValues.slice(index_offset)
  // DIRTY FIX: add the 100.0 offset to the 4th video
  if (videoID == '4') {
    EDAValues.unshift({ offset: -100.0 + peak_offset, EDA: 0.0 }, { offset: -0.2 + peak_offset, EDA: 0.0 })
  }

  const configFunc = animeConfigs[type]
  if (!configFunc) {
    throw new Error(`START_VIS: Invalid visualization type "${type}"`)
  }

  // If the type if vibration: hardcode a special handling here
  if (type == 'vibration') {
    console.log('START_VIS: Vibration config detected')
    // configFunc returns the Promise of sendMessage response. Wait for it to resolve (the pi did start the motor).
    const response = await browser.runtime.sendMessage({
      action: 'START_VIBRATION',
      videoID,
      adjustOffset: peak_offset,
      prepend: 0.0,
      // prepend: videoID == '4' ? 100.0 : 0.0,
    })
    if (response?.error) {
      throw new Error(`START_VIS: Vibration failed: ${response.error}`)
    }
    return
  }

  if (!anime) {
    throw new Error('START_VIS: Anime.js library not found')
  }

  if (!EDAValues.length) {
    throw new Error('START_VIS: No data to visualize')
  }

  // Find the video container as the animation target
  const container = getVideoContainer()
  if (!container) {
    throw new Error(`START_VIS: Could not find video container element`)
  } else {
    console.log('START_VIS: Found video container element', container)
  }

  const config = await configFunc(EDAValues, container)

  if (!config) {
    // This config does not require animejs
    // Directly finish the initialization
    return
  }
  animation = anime(config)
  animation.visType = type // monkey-patch the animation object

  // Bind animation playback with video playback
  const videoEl = getVideoEl()
  if (!videoEl) throw new Error("START_VIS: Cannot find video element on page")
  function handlePlaying() {
    if (!animation) return;
    // animejs也tm搞笑，官网没说，play的时候seek不保证成功，要pause再seek再play
    animation.pause()
    // 注意，animation.duration和.seek()都是ms为单位的时间值，animation.progress是百分比
    // 把animation设置到video的当前时间点
    const currentTimeMs = getCurrentTime() * 1000
    if (currentTimeMs != undefined) {
      // 还是怕B站整出什么妖蛾子get不到currentTime
      animation.seek(currentTimeMs)
    }
    animation.play()
    console.log('VIS: play & seek animation to', currentTimeMs);
  }
  function handlePause() {
    if (!animation) return;
    if (!animation.paused) {
      animation.pause();
    }
    console.log('VIS: pause animation');
  }
  videoEl.addEventListener('playing', handlePlaying)
  videoEl.addEventListener('pause', handlePause)

  console.log("START_VIS: Visualization initialized successfully", animation)
}

function checkVisualization() {
  return {
    initialized: !!animation,
    paused: animation?.paused,
    type: animation?.visType,
  }
}

function destroyVisualization() {
  // Stop vibration
  browser.runtime.sendMessage({ action: 'STOP_VIBRATION' })
  // Stop animation
  if (!animation) return;
  animation.pause()
  animation.seek(0)
  const oldTargets = animation.animatables.map(animatable => animatable.target)
  animation.remove(oldTargets)
  animation = null
  // Remove icon
  const visContainer = getOnScreenContainer()
  if (visContainer) visContainer.innerHTML = ''
  // Remove ambient light
  const videoContainer = getVideoContainer()
  if (videoContainer) videoContainer.style.boxShadow = 'none'
}
//#endregion

//#region Video play/pause event hooks
var videoHooksInstalled = false

/**
 * @param {string} action
 * @param {number?} offset
 * @returns {Promise<MessageResponse}
 */
function sendVideoActionToBackground(action, offset) {
  // console.log(`Content Script issuing ${action} to background`)
  return browser.runtime.sendMessage({ action, timestamp: Date.now(), offset })
}

/**
 * @returns {string | null} Error string. None if OK.
 */
function addVideoProgressListeners() {
  const videoEl = getVideoEl()
  if (!videoEl) {
    return 'Cannot find video element'
  }

  function handlePlaying() {
    console.log("VIDEO_HOOKS: video play", getCurrentTime())
    sendVideoActionToBackground('VIDEO_PLAY', getCurrentTime())
  }
  function handlePause() {
    console.log("VIDEO_HOOKS: video pause", getCurrentTime())
    sendVideoActionToBackground('VIDEO_PAUSE', getCurrentTime())
  }
  function handleEnd() {
    console.log("VIDEO_HOOKS: video end")
    sendVideoActionToBackground('VIDEO_END')
  }
  // function handleTimeUpdate() {
  //   const timeOffsetMs = getCurrentTime() * 1000
  //   const timestamp = Date.now()
  // }
  videoEl.addEventListener('playing', handlePlaying)
  videoEl.addEventListener('waiting', handlePause)
  videoEl.addEventListener('pause', handlePause)
  videoEl.addEventListener('ended', handleEnd)
  videoHooksInstalled = true
  return null;
}
//#endregion

//#region Handling messages
browser.runtime.onMessage.addListener(
  function (message, sender, sendResponse) {
    console.log("Content script received" + (sender.tab ?
      "from a content script:" + sender.tab.url :
      "from the extension") + JSON.stringify(message));
    switch (message?.action) {
      case 'START_VIS':
        initVisualization(message.type, message.videoID)
          .then(() => {
            sendResponse({ error: null })
            if (!playVideo(message.videoID)) console.error('playVideo(): Cannot find video to play')
          })
          .catch(error => {
            alert(error)
            sendResponse({ error })
          });
        break;
      case 'CHECK_VIS':
        sendResponse({ error: null, response: checkVisualization() })
        break;
      case 'STOP_VIS':
        destroyVisualization()
        sendResponse({ error: null })
        break;
      case 'INIT_HOOKS': {
        if (videoHooksInstalled) {
          sendResponse({ error: null })
          break
        }
        const error = addVideoProgressListeners()
        if (error) {
          alert(error)
        }
        sendResponse({ error })
        break;
      }
      case 'CHECK_HOOKS':
        sendResponse({ error: null, response: videoHooksInstalled })
        break;
      default: {
        const error = `message.action is not valid. Got message ${JSON.stringify(message)}`
        alert(error)
        sendResponse({ error })
        break;
      }
    }
    return true
  }
);
//#endregion

//#region utility functions
function getVideoEl() {
  // B站视频被包在了closed shadow root里面，需要额外的步骤去拿
  // 本来closed shadow root是无法访问的，但是居然有一个chrome浏览器插件的API可以拿
  // 而且居然chrome文档不写，Mozilla文档才写，还是为Chrome写的，Firefox不支持
  // https://groups.google.com/a/chromium.org/g/chromium-extensions/c/JaHhogJuBOk
  // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/dom/openOrClosedShadowRoot
  // ======
  // 没事了，B站把原生video包了一层，自己实现的bwp-video就已经暴露了大部分原生video的API，反而是里面的原生video不带动的。
  let videoEl = videoElement || bwpElement

  if (!videoEl) {
    console.log("Content Script: Cannot find video element on page")
    return null
  }
  if (videoEl.matches('.ad-showing video')) {
    console.log("Content Script: Fail finding video because ad is playing")
    return null
  }

  return videoEl
}

function getVideoContainer() {
  let containerQuery;
  if (window.location.hostname.includes('youtube')) {
    // containerQuery = '#movie_player'
    containerQuery = '#player'
  } else {
    containerQuery = '.bpx-player-video-area'
  }
  return document.querySelector(containerQuery);
}

function getOnScreenContainer(videoContainer) {
  let element = document.querySelector('.hci-container')
  if (element) return element
  if (videoContainer) {
    element = document.createElement('div')
    element.classList.add('hci-container')
    videoContainer.append(element)
    return element
  }
}

/** 
 * @param {string} videoID 
 * @returns {boolean} true if the video is successfully played */
function playVideo(videoID) {
  const videoEl = getVideoEl()
  if (!videoEl) return false
  if (videoID == '4') videoEl.currentTime = 100.0
  else videoEl.currentTime = 0
  videoEl.play()
  return true
}

function enlargeVideo() {
  const container = getVideoContainer()
  container.classList.add('hci-video')
  // const bg = document.
}

function restoreVideo() {
  const container = getVideoContainer()
  container.classList.remove('hci-video')
}

function throttle(fn, threshhold, scope) {
  threshhold || (threshhold = 250);
  var last,
    deferTimer;
  return function () {
    var context = scope || this;

    var now = +new Date,
      args = arguments;
    if (last && now < last + threshhold) {
      // hold on to it
      clearTimeout(deferTimer);
      deferTimer = setTimeout(function () {
        last = now;
        fn.apply(context, args);
      }, threshhold);
    } else {
      last = now;
      fn.apply(context, args);
    }
  };
}
//#endregion

console.log("content script injected")
