if (typeof browser === "undefined") {
  var browser = chrome;
}

// 是不是有病Chrome不让给localhost发https请求？
// https://stackoverflow.com/questions/73287625/chrome-extension-manifest-v3-not-working-with-https-localhost-api
const baseURL = 'http://127.0.0.1:3000/'

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(sender.tab ?
    "from a content script:" + sender.tab.url :
    "from the extension", message);
    switch (message?.action) {
      case 'VIDEO_PLAY':
      case 'VIDEO_PAUSE':
      case 'VIDEO_END': {
        // Forward video actions from content script to outside
        const url = `${baseURL}playback`
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(message),
        }).then(res => {
            if (res.ok) {
              sendResponse({ error: null })
            } else {
              sendResponse({ error: res.text() })
            }
          })
          .catch(error => {
            error = `Error fetching /playback at ${message.action}: ${error}`
            console.error(error)
            sendResponse({ error })
          });
        break;
      }
      case 'START_VIBRATION':
      case 'STOP_VIBRATION': {
        const url = `${baseURL}vibration`
        const {action, ...body} = message
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ on: action === 'START_VIBRATION', ...body }),
        }).then(res => {
          if (res.ok) {
            sendResponse({ error: null })
          } else {
            sendResponse({ error: res.text() })
          }
        }).catch(error => {
          error = `Error fetching /vibration at ${message.action}: ${error}`
          console.error(error)
          sendResponse({ error })
        });
        break;
      }
      default:
        sendResponse({ error: `message.action is not valid. Got message ${message}` })
        break;
    }
  return true;
});


// /**
//  * @param {Message} message Message, must be object on Chrome
//  * @returns {Promise<MessageResponse>}
//  */
// async function sendTabMessage(message) {
//   const queryOptions = { active: true, lastFocusedWindow: true };
//   const [tab] = await browser.tabs.query(queryOptions);
//   return browser.tabs.sendMessage(tab.id, message)
//     .catch(e => console.error(e));
// }

// 如果把popup换成页面：打开这三行然后在manifest.json里面去掉action.default_popup（但是action要留着，就算是空的），并且把popup/index.html加进web_accessible_resources
// browser.action.onClicked.addListener(tab => {
//     browser.tabs.create({'url': browser.runtime.getURL('popup/index.html')});
// })

// SB Chrome 必须写这么一段不然调试的时候重新加载插件会出问题
// https://stackoverflow.com/questions/10994324/chrome-extension-content-script-re-injection-after-upgrade-or-install
// https://groups.google.com/a/chromium.org/g/chromium-extensions/c/JPtI0_DZP-I?pli=1
// 不对，我遇到的是别的问题，这里暂时先划掉，不然每次刷新会重复定义全局变量，会导致报错
// chrome.runtime.onInstalled.addListener(async () => {
//   for (const cs of chrome.runtime.getManifest().content_scripts) {
//     for (const tab of await chrome.tabs.query({url: cs.matches})) {
//       chrome.scripting.executeScript({
//         target: {tabId: tab.id},
//         files: cs.js,
//         world: cs.world || 'ISOLATED'
//       });
//     }
//   }
// });