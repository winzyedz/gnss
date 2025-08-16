let data = { timestamps: [], speeds: [], accel: [] };
let playing = false;
let startTime = 0;
let currentTime = 0;
let startMark = null;
let endMark = null;

let traceSpeed, traceAccel, markerSpeed, markerAccel, layout;

function handleFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    parseGPX(e.target.result);
  };
  reader.readAsText(file);
}

function parseGPX(gpxText) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(gpxText, "application/xml");
  const trkpts = xmlDoc.getElementsByTagName("trkpt");

  let timestamps = [], speeds = [], accel = [];
  let start_time = null;

  for (let i = 1; i < trkpts.length; i++) {
    let lat1 = parseFloat(trkpts[i-1].getAttribute("lat"));
    let lon1 = parseFloat(trkpts[i-1].getAttribute("lon"));
    let lat2 = parseFloat(trkpts[i].getAttribute("lat"));
    let lon2 = parseFloat(trkpts[i].getAttribute("lon"));

    let t1 = new Date(trkpts[i-1].getElementsByTagName("time")[0].textContent);
    let t2 = new Date(trkpts[i].getElementsByTagName("time")[0].textContent);

    if (!start_time) start_time = t1;

    let dt = (t2 - t1) / 1000;
    if (dt <= 0) continue;

    let R = 6371000;
    let toRad = d => d * Math.PI / 180;
    let dLat = toRad(lat2-lat1);
    let dLon = toRad(lon2-lon1);
    let a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    let dist = R * c;

    let speed_mps = dist / dt;
    let speed_kph = speed_mps * 3.6;

    let acc = 0;
    if (i >= 2) {
      let t0 = new Date(trkpts[i-2].getElementsByTagName("time")[0].textContent);
      let dt_prev = (t1 - t0) / 1000;
      if (dt_prev > 0) {
        let lat0 = parseFloat(trkpts[i-2].getAttribute("lat"));
        let lon0 = parseFloat(trkpts[i-2].getAttribute("lon"));
        let dLat0 = toRad(lat1-lat0);
        let dLon0 = toRad(lon1-lon0);
        let a0 = Math.sin(dLat0/2)**2 + Math.cos(toRad(lat0)) * Math.cos(toRad(lat1)) * Math.sin(dLon0/2)**2;
        let c0 = 2 * Math.atan2(Math.sqrt(a0), Math.sqrt(1-a0));
        let dist_prev = R * c0;
        let prev_speed_mps = dist_prev / dt_prev;
        acc = (speed_mps - prev_speed_mps) / dt;
      }
    }

    timestamps.push((t2 - start_time)/1000);
    speeds.push(speed_kph);
    accel.push(acc);
  }

  data = { timestamps, speeds, accel };
  plotGraph();
}

function plotGraph() {
  traceSpeed = {
    x: data.timestamps,
    y: data.speeds,
    mode: 'lines',
    name: 'Speed (km/h)',
    yaxis: 'y1',
    line: { color: 'blue' }
  };
  traceAccel = {
    x: data.timestamps,
    y: data.accel,
    mode: 'lines',
    name: 'Acceleration (m/s²)',
    yaxis: 'y2',
    line: { color: 'red' }
  };
  markerSpeed = {
    x: [data.timestamps[0]],
    y: [data.speeds[0]],
    mode: 'markers',
    name: 'Speed Marker',
    marker: { size: 10, color: 'green' },
    yaxis: 'y1'
  };
  markerAccel = {
    x: [data.timestamps[0]],
    y: [data.accel[0]],
    mode: 'markers',
    name: 'Accel Marker',
    marker: { size: 10, color: 'orange' },
    yaxis: 'y2'
  };
  layout = {
    title: 'Speed and Acceleration Over Time',
    xaxis: { title: 'Time (s)' },
    yaxis: { title: 'Speed (km/h)', side: 'left' },
    yaxis2: { title: 'Acceleration (m/s²)', overlaying: 'y', side: 'right' },
    paper_bgcolor: "#ffffffff",
    plot_bgcolor: "#ffffffff",
    font: { color: "#000000ff" },
    shapes: []
  };

  Plotly.newPlot('graph', [traceSpeed, traceAccel, markerSpeed, markerAccel], layout);

  // ✅ รีไซส์มือถืออัตโนมัติ
  enableResponsivePlot();
}

function enableResponsivePlot() {
  window.addEventListener('resize', () => {
    Plotly.Plots.resize('graph');
  });
}

function setBookmark() {
  const s = parseFloat(document.getElementById("startInput").value);
  const e = parseFloat(document.getElementById("endInput").value);
  if (!isNaN(s)) startMark = s;
  if (!isNaN(e)) endMark = e;

  layout.shapes = [];
  if (startMark !== null) layout.shapes.push({ type: 'line', x0: startMark, x1: startMark, y0: 0, y1: 1, yref: 'paper', line: { color: 'green', dash: 'dot' } });
  if (endMark !== null) layout.shapes.push({ type: 'line', x0: endMark, x1: endMark, y0: 0, y1: 1, yref: 'paper', line: { color: 'red', dash: 'dot' } });

  Plotly.react('graph', [traceSpeed, traceAccel, markerSpeed, markerAccel], layout);
}

function interpolate(x, x0, x1, y0, y1) {
  if (x1 - x0 === 0) return y0;
  return y0 + (x - x0) * (y1 - y0) / (x1 - x0);
}

function updateMarker(t) {
  for (let i = 0; i < data.timestamps.length-1; i++) {
    if (t >= data.timestamps[i] && t <= data.timestamps[i+1]) {
      let xs = interpolate(t, data.timestamps[i], data.timestamps[i+1], data.timestamps[i], data.timestamps[i+1]);
      let ys = interpolate(t, data.timestamps[i], data.timestamps[i+1], data.speeds[i], data.speeds[i+1]);
      let ya = interpolate(t, data.timestamps[i], data.timestamps[i+1], data.accel[i], data.accel[i+1]);

      markerSpeed.x = [xs];
      markerSpeed.y = [ys];
      markerAccel.x = [xs];
      markerAccel.y = [ya];

      Plotly.react('graph', [traceSpeed, traceAccel, markerSpeed, markerAccel], layout);
      document.getElementById("status").innerText =
        `Time: ${xs.toFixed(2)} s | Speed: ${ys.toFixed(2)} km/h | Accel: ${ya.toFixed(2)} m/s²`;
      break;
    }
  }
}

function step() {
  if (!playing) return;
  let elapsed = (Date.now() - startTime) / 1000;
  currentTime = elapsed;
  let maxTime = endMark !== null ? endMark : data.timestamps[data.timestamps.length-1];
  if (elapsed > maxTime) { playing = false; return; }
  updateMarker(currentTime);
  requestAnimationFrame(step);
}

function play() {
  if (playing) return;
  let minTime = startMark !== null ? startMark : 0;
  if (currentTime < minTime) currentTime = minTime;
  startTime = Date.now() - currentTime * 1000;
  playing = true;
  requestAnimationFrame(step);
}

function pause() { playing = false; }
function reset() { currentTime = startMark !== null ? startMark : 0; updateMarker(currentTime); }

function screenshot() {
  Plotly.toImage(document.getElementById('graph'), { format: 'png', width: 1200, height: 600, scale: 2 })
    .then(function(dataUrl) {
      let img = new Image();
      img.src = dataUrl;
      img.onload = function() {
        let canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        let ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        let maxSpeed = Math.max(...data.speeds);
        let maxAccel = Math.max(...data.accel);

        // ✅ ใส่เครดิตตรงนี้
        ctx.fillStyle = "black";
        ctx.font = "20px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText("Speed data log WNZY Project 2025 by WINZYEDZ", canvas.width - 20, canvas.height - 20);

        ctx.fillStyle = "black";
        ctx.font = "18px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`Max Speed: ${maxSpeed.toFixed(2)} km/h`, 20, canvas.height - 45);
        ctx.fillText(`Max Accel: ${maxAccel.toFixed(2)} m/s²`, 20, canvas.height - 20);

        let finalURL = canvas.toDataURL("image/png");
        let a = document.createElement("a");
        a.href = finalURL;
        a.download = "speed_log_winzyedz.png";
        a.click();
      };
    });
}


