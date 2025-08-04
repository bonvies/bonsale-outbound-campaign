const { logWithTimestamp, errorWithTimestamp } = require('../util/timestamp.js');
const { projectOutboundMakeCall } = require('./projectOutboundMakeCall.js');
const {
  getOutbound,
  updateCallStatus,
  updateBonsaleProjectAutoDialExecute,
  updateDialUpdate,
} = require('../services/bonsale.js');
const { mainActionType } = require('../util/mainActionType.js');

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

function autoOutboundWatchDog(action, project, projectIndex, projectArray, isProjectErrorAutoRestart) {
  const { projectId, callFlowId } = project;

  if(mainActionType(action) === 'active') {
    logWithTimestamp(`專案 ${projectId} / ${callFlowId} 狀態為 'active'，開始撥打電話`);
    return true; // 可以撥打電話
  } else if (mainActionType(action) === 'waiting') {
    logWithTimestamp(`專案 ${projectId} / ${callFlowId} 狀態為 'waiting'，已經 mackCall，還在等待 3cx 的 agent 回應`);
    
    const currentTime = new Date().getTime();
    const lastCallTime = project._makeCallTimes || 0; // 如果沒有撥打時間，則默認為 0
    const timeDifference = currentTime - lastCallTime; // 計算時間差

    if (timeDifference >= 60 * 1500) { // 如果時間差大於等於 1.5 分鐘
      logWithTimestamp(`警告：專案 ${projectId} / ${callFlowId} 已經等待超過 1 分鐘，開始強制更新狀態 callState === 2`);
      const { customerId } = project._toCall;

      if (!customerId) {
        errorWithTimestamp(`找不到 customerId，無法強制更新狀態`);
        return false;
      }

      const updatePromises = [];
      updatePromises.push(
        updateCallStatus(
          projectId,
          customerId,
          2, // 強制紀錄該專案為 callState === 2 狀態
        ),
        updateBonsaleProjectAutoDialExecute(
          projectId,
          callFlowId
        ),
        updateDialUpdate(
          projectId,
          customerId
        )
      );

      // 等待所有的 API 請求完成
      // 逐行（依序）執行
      (async () => {
        try {
          for (const promise of updatePromises) {
            await promise; // 一個一個來
          }
        } catch (err) {
          errorWithTimestamp(`強制更新狀態時發生錯誤: ${err.message}`);
        }
      })();

      projectArray[projectIndex] = {
        ...project,
        action: 'active',
        error: null, // 清除錯誤訊息
      };
    }
    
    return false; // 不需要再撥打電話
  } else if (mainActionType(action) === 'pause') {
    logWithTimestamp(`專案 ${projectId} / ${callFlowId} 狀態為 'pause'，已經暫停撥打`);
    return false; // 不需要再撥打電話
  } else if (mainActionType(action) === 'error') {
    if (isProjectErrorAutoRestart) {
      logWithTimestamp(`專案 ${projectId} / ${callFlowId} 狀態為 'error'，開始重新撥打`);
      projectArray[projectIndex] = {
        ...project,
        action: 'active', // 將專案狀態設為 'active'
        error: null, // 清除錯誤訊息
      };
      return true; // 可以撥打電話
    } else {
      if (action === 'error - notAvailable') {
        logWithTimestamp(`專案 ${projectId} / ${callFlowId} 狀態為 'error - notAvailable'，自動重新撥打`);
        projectArray[projectIndex] = {
          ...project,
          action: 'active', // 將專案狀態設為 'active'
          error: null, // 清除錯誤訊息
        };
        return false; // 不需要再撥打電話
      }
      logWithTimestamp(`專案 ${projectId} / ${callFlowId} 狀態為 'error'，不進行重新撥打`);
      return false; // 不需要再撥打電話
    }
  } else {
    return false; // 其他狀態不撥打電話
  }
}

// 撥打邏輯
async function autoOutbound(project, projectIndex, projectArray, isProjectErrorAutoRestart) {
  try {
    // 檢查專案 action 狀態
    const { grant_type, client_id, client_secret, callFlowId, projectId, action } = project;

    if (autoOutboundWatchDog(action, project, projectIndex, projectArray, isProjectErrorAutoRestart)) {
      // 先抓 callState = 0 名單
      const firstOutboundData = await startGetOutboundList(callFlowId, projectId, 0);
      if (firstOutboundData) {
        const { phone, customerId } = firstOutboundData;
        logWithTimestamp(`第 1 輪 ---- 專案 ${projectId} / ${customerId} 有可撥打的名單: ${phone}，開始撥打電話`);

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

        // 如果撥打失敗，將專案狀態設為 error
        if (!firstOutbounCall.success) {
          errorWithTimestamp(`專案 ${projectId} 撥打電話失敗: ${firstOutbounCall.message}`);
          if (firstOutbounCall.tag === 'notAvailable') {
            projectArray[projectIndex] = {
              ...project,
              action: 'error - notAvailable', // 將專案狀態設為 error - notAvailable
              error: null, // 清除錯誤訊息
            };
            return; // 中斷撥打
          }
          projectArray[projectIndex] = {
            ...project,
            action: 'error', // 將專案狀態設為 error
            error: firstOutbounCall.message, // 儲存錯誤訊息
          };
          return; // 中斷撥打
        }

        projectArray[projectIndex] = {
          ...project,
          action: 'waiting', // 撥打完第一輪後，將 action 改為 waiting
          _toCall: { phone, customerId },
          _makeCallTimes: new Date().getTime(), // 記錄撥打時間戳記
          error: null, // 清除錯誤訊息
        };

        logWithTimestamp(`專案 ${projectId} 撥打電話成功: ${firstOutbounCall.message}`);
        return firstOutbounCall; // 返回撥打結果
      }
      
      // 如果沒有可撥打的初始名單，就檢查是 callState = 2 名單
      const secondOutboundData = await startGetOutboundList(callFlowId, projectId, 2);
      if (secondOutboundData) {
        const { phone, customerId } = secondOutboundData;
        logWithTimestamp(`第 2 輪 ---- 專案 ${projectId} / ${customerId} 有可撥打的名單: ${phone}，開始撥打電話`);

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
          if (secondOutboundCall.tag === 'notAvailable') {
            projectArray[projectIndex] = {
              ...project,
              action: 'error - notAvailable', // 將專案狀態設為 error - notAvailable
              error: null, // 清除錯誤訊息
            };
            return; // 中斷撥打
          }
          projectArray[projectIndex] = {
            ...project,
            action: 'error', // 將專案狀態設為 error
            error: secondOutboundCall.message, // 儲存錯誤訊息
          };
          return; // 中斷撥打
        }

        projectArray[projectIndex] = {
          ...project,
          action: 'waiting', // 撥打完第二輪後，將 action 改為 waiting
          _toCall: { phone, customerId },
          _makeCallTimes: new Date().getTime(), // 記錄撥打時間戳記
          error: null, // 清除錯誤訊息
        };

        return secondOutboundCall; // 返回撥打結果
      }
    }
  } catch (error) {
    console.error(`autoOutbound 發生錯誤: ${error}`);
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