const apiBaseURL = "http://localhost:3000/";
const mqttURL = "ws://192.168.1.102:8080"; // https://github.com/mqttjs/MQTT.js/issues/1163#issuecomment-864112585

function getID() {
  const form = document.getElementById("form-id")
  const userID = form.elements["userID"].value
  const videoID = form.elements["videoID"].value
  const prefix = form.elements["uesrIDPrefix"].value
  return {userID, videoID, prefix}
}

function setSensors(newState) {
  logError(`Setting sensors to ${newState}`, false)
  return fetch(`${apiBaseURL}sensor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ on: newState }),
    }).then((res) => {
      if (!res.ok) {
        logError(res.text());
      }
      return res
    }).catch((error) => {
      logError(error);
    });
}

function toggleSensors(event) {
  const button = event.target
  // on is a string indicating the current state of a toggle
  const {on} = button.dataset
  const newState = on === 'true' ? false : true

  // check whether ID is set
  const {userID, videoID} = getID()
  if (newState && (!userID || !videoID)) {
    alert('Please enter both user ID and video ID')
    return;
  }

  // POST /sensor with JSON body { on: boolean }, the value being the opposite of the current state
  setSensors(newState)
    .then((res) => {
    if (res.ok) {
      button.dataset.on = newState.toString()
      button.textContent = newState ? 'Take down sensors' : 'Bring up sensors'
    }
  })
}

function setID(event) {
  event.preventDefault();
  const {userID, videoID, prefix} = getID()
  if (!userID || !videoID) {
    alert('Please enter both user ID and video ID')
    return;
  }
  let uID = prefix + userID

  const btn = document.getElementById('btn-submit-id')
  btn.classList.add('loading')
  btn.classList.remove('btn-error', 'btn-success')
  fetch(`${apiBaseURL}id`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userID: uID, videoID }),
  }).then((res) => {
    btn.classList.remove('loading')
    btn.classList.add(res.ok ? 'btn-success' : 'btn-error')
    if (res.ok) {
      logError(`ID sent successfully ${uID}, ${videoID}`, false)
      document.getElementById('btn-sensors').removeAttribute('disabled')
    } else {
      logError(res.text());
    }
  }).catch((error) => {
    btn.classList.remove('loading')
    btn.classList.add('btn-error')
    logError(error);
  });
}

function logError(error, isError) {
  isError = isError ?? true
  isError ? console.error(error) : console.log(error)

  const span = document.createElement('span')
  isError ? span.classList.add('error') : span.classList.add('log')
  span.textContent = new Date().toLocaleTimeString() + ' ' + error.toString()
  const container = document.getElementById('error-log')

  if (!container.children.length) {
    container.append(span)
  } else {
    container.append(document.createElement('br'), span)
  }
}

function connectMQTT() {
  const btn = document.getElementById('btn-mqtt')
  btn.classList.add('loading')

  const client = mqtt.connect(mqttURL, {
    username: 'zeyu',
    password: 'YouAreTheBest',
    clientId: 'central-frontend',
  });

  client.on("connect", () => {
    logError("Connected to MQTT broker", false)
    client.subscribe("sensor/data")
    btn.classList.remove('loading')
    btn.setAttribute('disabled', true)
  });

  client.on("error", (err) => { // when the client cannot connect
    logError(err) 
    btn.classList.remove('loading')
    btn.removeAttribute('disabled')
  });
  client.on("offline", () => logError("MQTT broker goes offline"));
  client.on("disconnect", () => logError("MQTT client has been disconnected by the broker"));
  client.on("reconnect", () => logError("MQTT client tries to reconnect"));
  client.on("close", () => logError("MQTT client has closed"));

  return client
}

document.getElementById('btn-sensors').addEventListener('click', toggleSensors)
document.getElementById('btn-sensors-off').addEventListener('click', () => setSensors(false))
document.getElementById('form-id').addEventListener('submit', setID)

const plotCanvases = {
  'GSR': document.getElementById('canvas-plot-gsr').getContext('2d'),
  'HR': document.getElementById('canvas-plot-hr').getContext('2d'),
  'EMG': document.getElementById('canvas-plot-emg').getContext('2d'),
}
const charts = {}
for (const signal in plotCanvases) {
  const ctx = plotCanvases[signal]
  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        label: signal,
        data: [],
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        animation: false,
      }]
    },
    options: {
      scales: {
        x: {
          display: false,
          type: 'timeseries',
          time: {
            unit: 'second'
          }
        },
        y: signal === 'HR' ? { max: 200, min: 50 } : { max: 1024, min: 0 }
      },
      events: [],
      plugins: {
        title: {
          text: signal,
          display: true,
        },
        tooltip: {
          enabled: false,
        },
        legend: {
          display: false,
        },
      },
    }
  });
  charts[signal] = chart
}

const client = connectMQTT()
client.on("message", function (topic, payload) {
  const {ts, ...data} = JSON.parse(payload.toString());
  console.log("Received message from MQTT broker", data);
  for (const signal in data) {
    const chart = charts[signal]
    if (!chart) continue;
    chart.data.datasets[0].data.push({
      x: new Date(parseInt(ts * 1000)),
      y: data[signal],
    })
    if (chart.data.datasets[0].data.length > 20) {
      chart.data.datasets[0].data.shift()
    }
    chart.update()
  }
});