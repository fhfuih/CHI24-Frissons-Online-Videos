#!/usr/bin/env -S node

const express = require('express')
var cors = require('cors')

const {sensorUp, sensorDown, setVibration, onMQTTMessage} = require('./mqttClient')
const {addBiosignal, addPlayBack} = require('./mongo')

let userID;
let videoID;
let data;

let vibrationTimeout = null;
// let vibrationAnimation = null;
// const vibrationAnimatedObject = { vibration: 0 }

onMQTTMessage(message => {
  addBiosignal(userID, videoID, message)
    .catch(error => console.error(error));
})

const app = express()
const port = 3000
app.use(cors())
app.use(express.json())

app.post('/playback', (req, res) => {
  const { action, timestamp, offset } = req.body

  if (!action || !timestamp) {
    const reason = `/playback Param incomplete. Expect action, timestamp, offset. Got ${req.body}`
    console.error(reason)
    res.status(418).send(reason)
    return
  }

  if (!userID || !videoID) {
    const reason = `/playback userID or videoID not set! ${userID}, ${videoID}`
    console.error(reason)
    res.status(418).send(reason)
    return
  }

  const timeString = new Date(timestamp).toLocaleTimeString()
  console.log(`/playback Adding playback event ${action} at ${timeString} (${timestamp}) with offset ${offset}`)

  addPlayBack(userID, videoID, action, timestamp, offset)
    .then(() => {
      res.sendStatus(200)
    })
    .catch(error => {
      res.status(418).send(error.toString())
    });
})

app.post('/id', (req, res) => {
  const {userID: newUserID, videoID: newVideoID} = req.body
  if (!newUserID || !newVideoID) {
    res.status(418).send(`/id Param incomplete. Expect userID, videoID. Got ${req.body}`)
    return
  }
  console.log(`/id Setting userID to ${newUserID} and videoID to ${newVideoID}`)
  userID = newUserID
  videoID = newVideoID
  res.sendStatus(200)
})

// Listen to POST at '/sensor', read the boolean 'on' field in the body and call sensorUp() or sensorDown()
app.post('/sensor', (req, res) => {
  const {on} = req.body
  if (on == undefined) {
    res.status(418).send(`Param incomplete. Expect on. Got ${req.body}`)
  }
  const callback = (error) => {
    if (error) {
      res.status(418).send(error.toString())
    }
    res.sendStatus(200)
  }
  on ? sensorUp(callback) : sensorDown(callback)
})

// Listen to POST at '/vibration' and start to call setVibration() repeatedly with the data and interval from the json file
function shutdownVibration() {
  clearTimeout(vibrationTimeout)
  vibrationTimeout = null
  setVibration(0, error => error && console.log(`Error setting vibration to 0`))
}

app.post('/vibration', (req, res) => {
  const on = req.body.on ?? true // Default: turn ON the sensor
  const adjustOffset = req.body.adjustOffset ?? 0
  const prepend = req.body.prepend ?? 0
  const {videoID} = req.body

  if (on && vibrationTimeout != null) {
    res.status(418).send(`Vibration already running!`)
    console.log('Vibration already running!')
    return
  }

  if (!on) {
    console.log('Shutting down vibration')
    shutdownVibration()
    res.sendStatus(200)
    return
  }

  if (!videoID) {
    console.log('Missing videoID')
    res.status(418).send(`Param incomplete. Expect videoID. Got ${req.body.videoID}`)
    return
  }
  if (adjustOffset < 0 || prepend < 0) {
    console.log('Invalid adjustOffset or prepend')
    res.status(418).send(`Param incomplete. Expect adjustOffset and prepend to be non-negative. Got ${adjustOffset}, ${prepend}`)
    return
  }

  console.log(`Starting vibration with adjustOffset: ${adjustOffset}, prepend: ${prepend}, videoID: ${videoID}`)

  // This is a dirty one. I directly load the data file from browser extension folder.
  // This ensures single source of truth and requires minimal communication payload between the extension and the service.
  data = require(`../../browser-extension/data/peak_window_EDA_${videoID}.json`)

  // DIRTY FIX: adjust the data offset.
  // only the difference between two offsets matters, so simply slicing is possible
  if (adjustOffset) {
    const index_offset = adjustOffset * 5 // 5Hz
    data = data.slice(index_offset)
  }
  // DIRTY FIX: add the 100.0 offset to the 4th video
  // No, I will manually drag the playhead
  // if (prepend) {
  //   data.unshift({ offset: -prepend + adjustOffset, EDA: 0.0 }, { offset: -0.2 + adjustOffset, EDA: 0.0 })
  // }

  let currentIndex = 0

  function processNext() {
    if (currentIndex >= data.length) {
        // All elements processed
        shutdownVibration()
        return;
    }

    let {EDA, offset} = data[currentIndex]
    EDA = Math.max(Math.min(EDA, 1), 0)
    EDA = EDA * 0.7
    setVibration(EDA, (error) => {
      if (!error) return
      console.log(`Error setting vibration ${EDA} at offset: ${error}`)
    })

    currentIndex++;
    if (currentIndex < data.length) {
        let nextItem = data[currentIndex]
        let delayMs = (nextItem.offset - offset) * 1000
        vibrationTimeout = setTimeout(processNext, delayMs)
        // console.log(`Setting next vibration #${currentIndex} after delay: ${delayMs}`)
    }
  }

  processNext()
  res.sendStatus(200)
})

app.listen(port, () => {
  console.log(`HTTP server listening on port ${port}`)
})


/** 
* @param {Message} message
* @param {(res: MessageResponse) => void} push
* @param {() => void} done
* @returns {MessageResponse | void} If returning void, the push response is handled internally
*/
// function processBrowserMessage(message, push, done) {
//   switch (message?.action) {
//     case 'ping':
//       return {
//         error: null,
//         response: 'pong'
//       }
//     case 'SENSOR_UP':
//       sensorUp((error) => {
//         if (error) {
//           console.error(error)
//         }
//         push({ error })
//         done()
//       })
//       return;
//     case 'SENSOR_DOWN':
//       sensorDown((error) => {
//         if (error) {
//           console.error(error)
//         }
//         push({ error })
//         done()
//       })
//       return;
//     case 'VIDEO_PLAY':
//     case 'VIDEO_END':
//     case 'VIDEO_PAUSE':
//       if (!userID || !videoID) {
//         return { error: `userID or videoID not set! ${userID}, ${videoID}` }
//       }
//       addPlayBack(userID, videoID, message.action, message.ts)
//         .then(() => {
//           push({ error: null })
//           done()
//         })
//         .catch(error => {
//           push({ error })
//           done()
//         });
//       return;
//     case 'ID_SET':
//       userID = message.userID
//       videoID = message.videoID
//       return { error: null }
//     default:
//       return {
//         error: `message.action is not valid. Got message ${JSON.stringify(message)}`
//       }
//   }
// }
