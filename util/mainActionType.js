/**
 * 取得 action 的主要狀態（例如 'pause - hangup' 會回傳 'pause'）
 * @param {string} action
 * @returns {string}
 */
function mainActionType(action) {
  if (!action) return '';
  return action.split(' ')[0];
}

module.exports = { mainActionType };