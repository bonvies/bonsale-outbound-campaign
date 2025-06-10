const { v4: uuidv4 } = require('uuid');
const {
  get3cxToken,
  makeCall,
  getCaller,
} = require('../services/callControl.js');

const {
  getReportAgentsInQueueStatistics,
  getUsers
} = require('../services/xApi.js');

const { logWithTimestamp, warnWithTimestamp, errorWithTimestamp } = require('../util/timestamp.js');

// 專案撥打電話的邏輯
// 這個函式會先取得 3CX 的 token，然後取得撥號者的分機資訊，接著檢查撥打者分配的代理人狀態
// 如果代理人狀態是空閒的，就可以撥打電話，否則就不撥打並回傳相應的訊息
// 如果撥打成功，則將請求加入佇列並返回成功訊息
// 如果在過程中發生錯誤，則記錄錯誤並返回錯誤訊息
// 注意：這個函式需要傳入必要的參數，包括 grant_type、client_id、client_secret、phone、projectId 和 customerId
// 如果缺少任何必要的參數，則記錄錯誤並返回 400 錯誤
async function projectOutboundMakeCall(
  grant_type,
  client_id,
  client_secret,
  phone,
  callFlowId,
  projectId,
  customerId,
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
    // logWithTimestamp(`撥打者分配的代理人狀態是 ${CurrentProfileName} 此狀態是設定是空閒的`);

    // 到這邊準備工作完成 可以開始撥打電話了
    // logWithTimestamp(`撥打者 ${client_id} / 準備撥給 ${phone} 手機`);
    const fetch_makeCall = await makeCall(token, queueDn, device_id, 'outbound', phone);
    if (!fetch_makeCall.success) return res.status(fetch_makeCall.error.status).send(fetch_makeCall.error); // 錯誤處理
    const currentCall = fetch_makeCall.data;
    logWithTimestamp('撥打電話請求:', currentCall);

    // 撥打電話的時候 會回傳 一個 callid 我們可以利用這個 callid 來查詢當前的撥打狀態
    const { callid } = currentCall.result;

    return {
      success: true,
      message: 'Request outboundCampaigm successfully',
      addInActiveCallQueue: { token, callid, id, phone, callFlowId, projectId, customerId },
      currentMakeCall: {
        id: currentCall.result.id,
        token,
        callid: currentCall.result.callid,
        dn: currentCall.result.dn,
        device_id: currentCall.result.device_id,
        party_caller_id: currentCall.result.party_caller_id
      }
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

module.exports = {
  projectOutboundMakeCall,
};