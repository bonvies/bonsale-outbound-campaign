const { getOutbound } = require('../services/bonsale.js');
const { logWithTimestamp, errorWithTimestamp } = require('../util/timestamp.js');
const { projectOutboundMakeCall } = require('./projectOutboundMakeCall.js');

// 根據 callFlowId 和 projectId 獲取可撥打的名單
// 這個函式會先嘗試獲取 callState = 0 的名單，如果沒有則嘗試獲取 callState = 2 的名單
// 如果有可撥打的名單，則返回第一個名單的電話號碼和客戶 ID
// 如果沒有可撥打的名單，則返回 null
// 如果獲取名單時發生錯誤，則記錄錯誤並拋出異常
async function startGetOutboundList(callFlowId, projectId, callState) {
  const outboundDataList = await getOutbound(callFlowId, projectId, callState);
  if (!outboundDataList.success) {
    errorWithTimestamp(`outboundDataList - ${outboundDataList.error.message}`);
    throw new Error(`outboundDataList - ${outboundDataList.error.message}`);
  }
  if (outboundDataList.data.list.length > 0) {
    logWithTimestamp(`專案 ${projectId} / ${callFlowId} 有可撥打的名單，開始撥打電話`);
    const outboundData = outboundDataList.data.list[0];
    const { phone, id: customerId } = outboundData.customer

    // await projectOutboundMakeCall(grant_type, client_id, client_secret, firstOutboundData.data[0].phone, projectId, customerId);
    return { phone, customerId };
  } else {
    logWithTimestamp(`專案 ${projectId} / ${callFlowId} 沒有可撥打的名單，等待下一次檢查`);
    return null; // 沒有可撥打的名單
  }
};

// 撥打邏輯
async function autoOutbound(project, projectIndex, projectArray) {
  try {
    // 檢查專案 action 狀態
    const { grant_type, client_id, client_secret, callFlowId, projectId, action } = project;

    if (action === 'active') {
      logWithTimestamp(`開始撥打專案: ${projectId} / ${callFlowId}`);

      // 先抓 callState = 0 名單
      const firstOutboundData = await startGetOutboundList(callFlowId, projectId, 0);
      if (firstOutboundData) {
        const { phone, customerId } = firstOutboundData;
        // logWithTimestamp(`第 1 輪 ---- 專案 ${projectId} / ${customerId} 有可撥打的名單: ${phone}，開始撥打電話`);
        // 撥打電話
        const firstOutbounCall = await projectOutboundMakeCall(
          grant_type,
          client_id,
          client_secret,
          phone,
          callFlowId,
          projectId,
          customerId,
          action
        );
        projectArray[projectIndex] = {
          ...project,
          action: 'waiting' // 撥打完第一輪後，將 action 改為 waiting
        };

        // 如果撥打失敗，將專案狀態設為 error
        if (!firstOutbounCall.success) {
          errorWithTimestamp(`專案 ${projectId} 撥打電話失敗: ${firstOutbounCall.message}`);
          projectArray[projectIndex] = {
            ...project,
            action: 'error', // 將專案狀態設為 error
            error: firstOutbounCall.message, // 儲存錯誤訊息
          };
          return;
        }

        logWithTimestamp(`專案 ${projectId} 撥打電話成功: ${firstOutbounCall.message}`);
        return firstOutbounCall; // 返回撥打結果
      }
      
      // 如果沒有可撥打的初始名單，就檢查是 callState = 2 名單
      const secondOutboundData = await startGetOutboundList(callFlowId, projectId, 2);
      if (secondOutboundData) {
        const { phone, customerId } = secondOutboundData;
        // logWithTimestamp(`第 2 輪 ---- 專案 ${projectId} / ${customerId} 有可撥打的名單: ${phone}，開始撥打電話`);
        // 撥打電話
        const secondOutboundCall = await projectOutboundMakeCall(
          grant_type,
          client_id,
          client_secret,
          phone,
          callFlowId,
          projectId,
          customerId,
          action
        );

        // 如果撥打失敗，將專案狀態設為 error
        if (!secondOutboundCall.success) {
          errorWithTimestamp(`專案 ${projectId} 撥打電話失敗: ${secondOutboundCall.message}`);
          projectArray[projectIndex] = {
            ...project,
            action: 'error', // 將專案狀態設為 error
            error: secondOutboundCall.message, // 儲存錯誤訊息
          };
          return;
        }

        projectArray[projectIndex] = {
          ...project,
          action: 'waiting' // 撥打完第一輪後，將 action 改為 waiting
        };
        return secondOutboundCall; // 返回撥打結果

        
      }
    }
  } catch (error) {
    errorWithTimestamp(`autoOutbound error: ${error.message}`);

    projectArray[projectIndex] = {
      ...project,
      action: 'error', // 將專案狀態設為 error
      error: error.message, // 儲存錯誤訊息
    };
  }
}

module.exports = {
  autoOutbound
};