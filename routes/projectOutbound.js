const express = require('express');
const WebSocket = require('ws');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const {
  get3cxToken,
  makeCall,
  getCaller,
} = require('../services/callControl.js');

const {
  activeCalls,
  getReportAgentsInQueueStatistics,
  getUsers
} = require('../services/xApi.js');
const { autoOutbound } = require('../components/autoOutbound.js');
const {
  updateCallStatus,
  updateBonsaleProjectAutoDialExecute,
  updateDialUpdate,
  updateVisitRecord
} = require('../services/bonsale.js');
const { logWithTimestamp, warnWithTimestamp, errorWithTimestamp } = require('../util/timestamp.js');

require('dotenv').config();

const CALL_GAP_TIME = parseInt(process.env.CALL_GAP_TIME) || 3; // 預設 3 秒

// 創建 WebSocket Server
const clientWsProjectOutbound = new WebSocket.Server({ noServer: true });

clientWsProjectOutbound.on('connection', (ws) => {
  logWithTimestamp('WebSocket Server - clientWsProjectOutbound: Client connected');

  ws.on('close', () => {
    logWithTimestamp('WebSocket Server - clientWsProjectOutbound: Client disconnected');
  });
});

let globalToken = null;
const projects = []; // 儲存專案資訊
const activeCallQueue = []; // 儲存活躍撥號的佇列



// 每 CALL_GAP_TIME 秒 進行自動撥號 並 檢查撥號狀態
setInterval(async () => {
  const updatePromises = []; // 儲存要推送的 Promises API

  projects.forEach(async (project, projectIndex, projectArray ) => {
    await autoOutbound(project, projectIndex, projectArray);
  });

  // TODO 目前搬移 撥號拿名單的邏輯到這邊 還要繼續搬 ...







  logWithTimestamp(`每 ${CALL_GAP_TIME} 秒檢查一次撥號狀態`);
  if (!globalToken) { // 如果沒有 token 就回傳給所有客戶端一個空陣列
    logWithTimestamp('沒有 globalToken，回傳空陣列');
    // clientWsProjectOutbound.clients.forEach((client) => {
    //   client.send(JSON.stringify([]));
    // });
    return;
  };

  try {
    // 獲取目前活躍的撥號狀態
    const fetch_getActiveCalls = await activeCalls(globalToken);
    logWithTimestamp('獲取目前活躍的撥號狀態:', fetch_getActiveCalls);

    // 如果 token 失效，清除 globalToken
    // 這邊的狀況是 token 失效了，這時候我們要清除 globalToken 讓流程持續
    if (!fetch_getActiveCalls.success && fetch_getActiveCalls.error.status === 401) {
      logWithTimestamp('token 失效，清除 globalToken 讓流程持續');
      globalToken = null; // 清除 token
      return
    }

    const activeCall = fetch_getActiveCalls.data; // 目前活躍的撥號狀態

    let matchingCallResults = []; // 儲存匹配的撥號物件

    // 遍歷 activeCallQueue，檢查是否有匹配的 callId
    for (let i = activeCallQueue.length - 1; i >= 0; i--) {
      const queueItem = activeCallQueue[i];
      const matchingCall = activeCall.value?.find(item => item.Id === queueItem.callid);

      if (matchingCall) {
        matchingCallResults.push({
          id:queueItem.id,
          phone: queueItem.phone,
          projectId: queueItem.projectId,
          customerId: queueItem.customerId,
          activeCall: matchingCall,
        });
        
      } else {
        // logWithTimestamp(`移除無匹配的 callId: ${queueItem.callid}`);
        activeCallQueue.splice(i, 1); // 移除無匹配的項目
      }
    }

    // 針對匹配的撥號物件 也新增近 Projects 中對應的 Project 資訊
    matchingCallResults = matchingCallResults.map((item) => {
      const project = projects.find(p => p.projectId === item.projectId);
      return {
        ...item,
        project: project ? {
          callFlowId: project.callFlowId,
          projectId: project.projectId,
          action: project.action,
        } : {}, // 如果找不到對應的專案，就設為 {}
      };
    });
    logWithTimestamp('匹配的撥號物件:', matchingCallResults);

    projects.forEach(async (project, projectIndex, projectArray ) => {
      // 檢查專案是否有匹配的撥號物件
      const projectCalls = matchingCallResults.find(item => item.projectId === project.projectId);
      if (projectCalls.length > 0) {
        // 如果有匹配的撥號物件，則更新專案狀態
        logWithTimestamp(`專案 ${project.projectId} 有匹配的撥號物件:`, projectCalls);
        // 更新專案狀態為 'active' 並儲存匹配的撥號物件
        projectArray[projectIndex] = {
          ...project,
          action: 'active',
          calls: projectCalls,
        };
      } else if (project.calls) { // 找到之前記錄在專案的撥打資料 
        // 如果沒有匹配的撥號物件，但專案中有 calls，則更新專案狀態為 'active' 並清除 calls
        logWithTimestamp(`專案 ${project.projectId} 沒有匹配的撥號物件`);

        updatePromises = [
          updateCallStatus(
            project.projectCallData.projectId,
            project.projectCallData.customerId,
            projectCalls.activeCall?.Status === 'Talking' ? 1 : 2, // 判斷撥打狀態是否為成功接通
          ),
          updateBonsaleProjectAutoDialExecute(
            project.projectCallData.projectId,
            project.callFlowId,
          ),
        ];
        //TODO 製作到這邊...

        projectArray[projectIndex] = {
          ...project,
          action: 'recorded', // 更新狀態為 'recorded'
          calls: projectCalls,
        };
      } else {
        // 如果沒有匹配的撥號物件，則更新專案狀態為 'start'
        logWithTimestamp(`專案 ${project.projectId} 沒有匹配的撥號物件，更新狀態為 'start'`);
        projectArray[projectIndex] = {
          ...project,
          action: 'start',
          calls: [],
        };
      }
    });

    // 將匹配的撥號物件傳送給 WebSocket Server 的所有連線客戶端
    clientWsProjectOutbound.clients.forEach((client) => {
      client.send(JSON.stringify(matchingCallResults));
    });

  } catch (error) {
    errorWithTimestamp('Error while checking active calls:', error.message);
  }
}, CALL_GAP_TIME * 1000); // 每 CALL_GAP_TIME 秒檢查一次撥號狀態













// 專案撥打電話的邏輯
// 這個函式會先取得 3CX 的 token，然後取得撥號者的分機資訊，接著檢查撥打者分配的代理人狀態
// 如果代理人狀態是空閒的，就可以撥打電話，否則就不撥打並回傳相應的訊息
// 如果撥打成功，則將請求加入佇列並返回成功訊息
// 如果在過程中發生錯誤，則記錄錯誤並返回錯誤訊息
// 注意：這個函式需要傳入必要的參數，包括 grant_type、client_id、client_secret、phone、projectId 和 customerId
// 如果缺少任何必要的參數，則記錄錯誤並返回 400 錯誤
async function projectOutbound(
  grant_type,
  client_id,
  client_secret,
  phone,
  projectId,
  customerId
) {
  const id = uuidv4();
  if (!grant_type || !client_id || !client_secret || !phone || !projectId || !customerId) {
    errorWithTimestamp('Missing required fields');
    return res.status(400).send('Missing required fields');
  }
  try {
    // 先取得 3CX token 
    const fetch_get3cxToken = await get3cxToken(grant_type, client_id, client_secret);
    if (!fetch_get3cxToken.success) {
      errorWithTimestamp('Failed to fetch_get3cxToken');
      return {
        success: false,
        message: fetch_get3cxToken.error.message,
        status: fetch_get3cxToken.error.status,
      };
    }
    const token = fetch_get3cxToken.data?.access_token; // 取得 access_token

    // 取得 撥號分機資訊 (需要設定 queue)
    const fetch_getCaller = await getCaller(token); // 取得撥號者
    if (!fetch_getCaller.success) {
      errorWithTimestamp('Failed to fetch_getCaller');
      return {
        success: false,
        message: fetch_getCaller.error.message,
        status: fetch_getCaller.error.status,
      };
    }
    const caller = fetch_getCaller.data
    const { dn: queueDn, device_id } = caller.devices[0]; // 這邊我只有取第一台設備資訊
    // logWithTimestamp('撥打者資訊 : ', caller);

    // 這邊 我們要判斷 撥打者分配的 代理人的狀態 (也就是分機人員) 他的狀態是不是空閒的
    // 如果是不是空閒的話 就可以不可以撥打電話 並回傳 res 訊息 ( 狀態碼要設 202 ) 

    // 取得 隊列 { queueDn } 的代理人資訊
    const currentDate = new Date().toISOString();
    const reportAgentsInQueueStatistics = await getReportAgentsInQueueStatistics(token, queueDn, currentDate, currentDate, '0:00:0');
    if (!reportAgentsInQueueStatistics.success) {
      errorWithTimestamp('Failed to getReportAgentsInQueueStatistics');
      return {
        success: false,
        message: reportAgentsInQueueStatistics.error.message,
        status: reportAgentsInQueueStatistics.error.status,
      };
    }
    // logWithTimestamp('撥打者分配的代理人狀態:', reportAgentsInQueueStatistics.data);
    const { Dn: agentDn } = reportAgentsInQueueStatistics.data.value[0]; // 這邊我只取第一個代理人資訊
    // logWithTimestamp('撥打者分配的代理人狀態:', agentDn , queueDn);

    // 有了 agentDn 我可以查看這個代理人的詳細狀態 包含是否為空閒狀態 ( CurrentProfileName 的值 )
    const fetch_getUsers = await getUsers(token, agentDn);
    if (!fetch_getUsers.success) {
      errorWithTimestamp('Failed to getUsers');
      return {
        success: false,
        message: fetch_getUsers.error.message,
        status: fetch_getUsers.error.status,
      };
    }
    const { CurrentProfileName, ForwardingProfiles } = fetch_getUsers.data.value[0]; // 這邊我只取第一個代理人詳細資訊

    // 我們用還需要知道 CurrentProfileName 的值 有沒有被 Log out from queues 這才是我們要的狀態
    // logWithTimestamp('撥打者分配的代理人詳細狀態:', CurrentProfileName, ForwardingProfiles);

    const findForwardingProfiles = ForwardingProfiles.find(profile => profile.Name === CurrentProfileName);
    const isLogOutFromQueues = findForwardingProfiles?.OfficeHoursAutoQueueLogOut;

    // logWithTimestamp('撥打者分配的代理人詳細狀態:', CurrentProfileName);

    /* NOTO 這邊的邏輯 被簡化了 變成只要 偵測 CurrentProfileName 只要不是 Available 就不要撥打電話

      // 如果不是空閒的話 就可以不可以撥打電話 並回傳 res 訊息 ( 狀態碼要設 202 )
      if (isLogOutFromQueues) {
        // warnWithTimestamp('撥打者分配的代理人狀態不是空閒的', CurrentProfileName);
        warnWithTimestamp(`撥打者分配的代理人狀態是 ${CurrentProfileName} 此狀態是設定不是空閒的`);
        return res.status(202).send({
          message: `撥打者分配的代理人狀態是 ${CurrentProfileName} 此狀態是設定不是空閒的`,
          status: CurrentProfileName,
          isLogOutFromQueues
        });
      }
    
    */

    // 如果不是空閒的話 就可以不可以撥打電話 並回傳 res 訊息 ( 狀態碼要設 202 )
    if (CurrentProfileName !== 'Available') {
      // warnWithTimestamp('撥打者分配的代理人狀態不是空閒的', CurrentProfileName);
      warnWithTimestamp(`撥打者分配的代理人狀態是 ${CurrentProfileName} 此狀態限制不能撥打電話`);
      return {
        message: `撥打者分配的代理人狀態是 ${CurrentProfileName} 此狀態限制不能撥打電話`,
        status: CurrentProfileName,
        isLogOutFromQueues
      };
    }
    // 如果是空閒的話 就可以準備撥打電話
    logWithTimestamp(`撥打者分配的代理人狀態是 ${CurrentProfileName} 此狀態是設定是空閒的`);

    // 到這邊準備工作完成 可以開始撥打電話了
    logWithTimestamp(`撥打者 ${client_id} / 準備撥給 ${phone} 手機`);
    const fetch_makeCall = await makeCall(token, queueDn, device_id, 'outbound', phone);
    if (!fetch_makeCall.success) return res.status(fetch_makeCall.error.status).send(fetch_makeCall.error); // 錯誤處理
    const currentCall = fetch_makeCall.data;
    logWithTimestamp('撥打電話請求:', currentCall);

    // 撥打電話的時候 會回傳 一個 callid 我們可以利用這個 callid 來查詢當前的撥打狀態
    const { callid } = currentCall.result;

    globalToken = token; // 儲存 token 以便後續使用

    // // 將請求加入佇列
    activeCallQueue.push({ token, callid, id, phone, projectId, customerId });

    return {
      success: true,
      message: 'Request outboundCampaigm successfully',
      token_3cx: token,
      currentCall
    };
  } catch (error) {
    errorWithTimestamp('Error in POST /projectOutbound:', error);
    return {
      success: false,
      message: error.message,
      status: error.status,
    };
  }
}






// projectOutbound API
router.post('/', async function(req, res, next) {
  const { grant_type, client_id, client_secret, callFlowId, projectId, action } = req.body;
  // action 有三種狀態 start, stop, pause
  if (!grant_type || !client_id || !client_secret || !callFlowId || !projectId || !action) {
    errorWithTimestamp('Missing required fields');
    return res.status(400).send('Missing required fields');
  }

  projects.push({ grant_type, client_id, client_secret, callFlowId, projectId, action });

  res.status(200).send({
    message: 'Request projectOutbound successfully'
  });
});

module.exports = { router, clientWsProjectOutbound, projectOutbound };
