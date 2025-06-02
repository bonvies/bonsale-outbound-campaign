// 加入台灣時間 (UTC+8) 的 log function
function getTaiwanTimestamp() {
  return new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
}

function logWithTimestamp(...args) {
  const now = getTaiwanTimestamp();
  console.log(`[${now}]`, ...args);
}
function warnWithTimestamp(...args) {
  const now = getTaiwanTimestamp();
  console.warn(`[${now}]`, ...args);
}
function errorWithTimestamp(...args) {
  const now = getTaiwanTimestamp();
  console.error(`[${now}]`, ...args);
}

module.exports = {
  logWithTimestamp,
  warnWithTimestamp,
  errorWithTimestamp
};