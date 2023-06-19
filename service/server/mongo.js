const { MongoClient } = require("mongodb");
const connectionURL = 'mongodb://localhost:27017/biosignalVideo'
const client = new MongoClient(connectionURL)
const database = client.db('biosignalVideo');
const biosignals = database.collection('biosignals');
const playback = database.collection('playback')

/**
 * @param {string | number} userID 
 * @param {string | number} videoID 
 * @param {string} action 
 * @param {number} timestamp 
 * @param {number?} offset
 */
function addPlayBack(userID, videoID, action, timestamp, offset) {
  if (!userID || !videoID || !action || !timestamp) {
    const reason = `userID, videoID, action or timpstamp not set! ${userID}, ${videoID}, ${action}, ${timestamp}`
    console.error(reason)
    return Promise.reject(reason)
  }
  return playback.insertOne({
    userID,
    videoID,
    action,
    timestamp,
    offset,
  })
}

/**
 * @param {string | number} userID 
 * @param {string | number} videoID 
 * @param {{ts: number} & Object.<string, number>} payload
 * @returns 
 */
function addBiosignal(userID, videoID, payload) {
  if (!userID || !videoID) {
    const reason = `userID or videoID not set! ${userID}, ${videoID}`
    console.error(reason)
    return Promise.reject(new Error(reason))
  }
  const {ts, ...data} = payload
  const doc = {
    timestamp: new Date(parseInt(ts * 1000)),
    metadata: {
      userID,
      videoID,
    },
    data,
  };
  return biosignals.insertOne(doc)
}

module.exports = {
  client,
  addBiosignal,
  addPlayBack,
}