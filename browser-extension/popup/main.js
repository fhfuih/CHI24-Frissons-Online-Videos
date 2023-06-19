if (typeof browser === "undefined") {
    var browser = chrome;
}

const videoURLByID = {
  'BV1bK411J7kX': '1',
  'BV1Vb41177ud': '3',
  'w_TaNm6lccQ': '4',
  'zsZMeEl6Gxk': '5',
}

function checkVideoHooks() {
  const btnInit = document.getElementById('btn-init')
  sendTabMessage({action: 'CHECK_HOOKS'})
    .then(res => {
      setButtonColor(btnInit, res.response)
    })
}

function checkVisualization() {
  const btnVis = document.getElementById('btn-vis')
  // const btnStop = document.getElementById('btn-vis-stop')
  const hint = document.getElementById('vis-current')
  sendTabMessage({action: 'CHECK_VIS'})
    .then(res => {
      const {initialized, paused, type} = res.response
      setButtonColor(btnVis, initialized)
      // setButtonEnabled(btnVis, !initialized)
      // setButtonEnabled(btnStop, initialized)
      hint.textContent = type || 'None'
    })
}

async function checkVideoID() {
  let videoID = null;
  const [tab] = await browser.tabs.query({ currentWindow: true, active: true });
  const href = tab.url
  console.log('href', href)
  for (const partialURL in videoURLByID) {
    if (href?.includes(partialURL)) {
      videoID = videoURLByID[partialURL]
    }
  }
  if (videoID) {
    const selectVideoID = document.getElementById('select-video-id')
    selectVideoID.value = videoID
  }
}

function handleSetVideoHooks() {
  return sendTabMessage({
    action: 'INIT_HOOKS'
  }).then((res) => {
    const btnInit = document.getElementById('btn-init')
    setButtonColor(btnInit, !res.error)
    if (res.error) {
      logError(res.error)
    }
  });
}

function handleSetVisualization() {
  const selectVis = document.getElementById('select-vis')
  const selectVideoID = document.getElementById('select-video-id')
  const type = selectVis.value
  const videoID = selectVideoID.value
  if (!type) {
    selectVis.classList.add('is-error')
    return;
  }
  if (!videoID) {
    selectVideoID.classList.add('is-error')
    return;
  }
  selectVis.classList.remove('is-error')
  selectVideoID.classList.remove('is-error')
  return Promise.all([
    sendTabMessage({
      action: 'START_VIS',
      type,
      videoID,
    }).then(res => {
      const btnVis = document.getElementById('btn-vis')
      // const btnStop = document.getElementById('btn-vis-stop')
      const hint = document.getElementById('vis-current')
      setButtonColor(btnVis, !res.error)
      // setButtonEnabled(btnVis, res.error)
      // setButtonEnabled(btnStop, !res.error)
      hint.textContent = type
      if (res.error) {
        logError(res.error)
      }
    }),
    handleSetVideoHooks()
  ])
}

function stopVisualization() {
  return sendTabMessage({
    action: 'STOP_VIS'
  }).then(res => {
    const btnVis = document.getElementById('btn-vis')
    const btnStop = document.getElementById('btn-vis-stop')
    const hint = document.getElementById('vis-current')
    setButtonColor(btnVis, false)
    // setButtonEnabled(btnVis, true)
    // setButtonEnabled(btnStop, false)
    hint.textContent = 'None'
    if (res.error) {
      logError(res.error)
      return
    }
  });
}

/**
 * @param {Message} message Message, must be object on Chrome
 * @returns {Promise<MessageResponse>} It never rejects
 */
async function sendTabMessage(message) {
  const queryOptions = { currentWindow: true, active: true };
  const [tab] = await browser.tabs.query(queryOptions);
  const response = await browser.tabs.sendMessage(tab.id, message)
  if (!response) {
    return {error: new Error(`POPUP: Error sending message ${JSON.stringify(message)} to tab: ${browser.runtime.lastError}`)}
  }
  return response
}

function logError(error) {
  console.error(error)
  const container = document.getElementById('error-log')
  if (container.textContent.length)
    container.textContent += '\n'
  container.textContent += (error?.action ?? error)
}

document.getElementById('btn-init').addEventListener('click', handleSetVideoHooks)
document.getElementById('btn-vis').addEventListener('click', handleSetVisualization)
document.getElementById('btn-vis-stop').addEventListener('click', stopVisualization)
checkVideoHooks()
checkVisualization()
checkVideoID()

function setButtonColor(btn, success) {
  btn.classList.remove('btn-error', 'btn-success')
  if (success) {
    btn.classList.add('btn-success')
  } else {
    btn.classList.add('btn-error')
  }
}

function setButtonEnabled(btn, enabled) {
  if (enabled) {
    btn.removeAttribute('disabled')
  } else {
    btn.setAttribute('disabled', true)
  }
}