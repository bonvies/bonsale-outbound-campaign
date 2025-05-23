const axios = require('axios');
require('dotenv').config();

const host = process.env.HTTP_HOST_3CX;

// 查詢當前活躍呼叫的列表
async function activeCalls (token) {
  try {
    const response = await axios.get(`${host}/xapi/v1/ActiveCalls`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    // console.log('成功 獲取當前活躍呼叫的列表:', response.data);
    // 回傳 API 的回應
    return { success: true, data: response.data }; // 返回成功
  } catch (error) {
    console.error('Error activeCalls request:', error.message);
    return { success: false, error: { status: error.status, message: `Error activeCalls request: ${error.message}` } }; // 返回錯誤
  }
};

// 查詢當前活躍呼叫的列表
async function activeCallId (token, callid) {
  try {
    const response = await axios.get(`${host}/xapi/v1/ActiveCalls?$filter=Id eq ${callid}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    // console.log('成功 獲取當前活躍呼叫的列表:', response.data);
    // 回傳 API 的回應
    return { success: true, data: response.data }; // 返回成功
  } catch (error) {
    console.error('Error activeCallId request:', error.message);
    return { success: false, error: { status: error.status, message: `Error activeCallId request: ${error.message}` } }; // 返回錯誤
  }
};

// 獲取當前 Queues 的列表
async function getQueues (token) {
  try {
    const response = await axios.get(`${host}/xapi/v1/Queues`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    // console.log('成功 獲取當前 Queues 的列表:', response.data);
    // 回傳 API 的回應
    return { success: true, data: response.data }; // 返回成功
  } catch (error) {
    console.error('Error Queues request:', error.message);
    return { success: false, error: { status: error.status, message: `Error getQueues request: ${error.message}` } }; // 返回錯誤
  }
};

// 獲取當前 Queues 的列表
async function getQueuesById (token, id) {
  try {
    const response = await axios.get(`${host}/xapi/v1/Queues(${id})?expand=Agents`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    // console.log('成功 獲取當前 Queues 的列表:', response.data);
    // 回傳 API 的回應
    return { success: true, data: response.data }; // 返回成功
  } catch (error) {
    console.error('Error getQueuesById request:', error.message);
    return { success: false, error: { status: error.status, message: `Error getQueuesById request: ${error.message}` } }; // 返回錯誤
  }
};

// 取得報告隊列中的代理統計信息
async function getReportAgentsInQueueStatistics (token, queueDnStr, startDt, endDt, waitInterval) {
  try {
    const response = await axios.get(`${host}/xapi/v1/ReportAgentsInQueueStatistics/Pbx.GetAgentsInQueueStatisticsData(queueDnStr='${queueDnStr}',startDt=${startDt},endDt=${endDt},waitInterval='${waitInterval}')`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    // 回傳 API 的回應
    return { success: true, data: response.data }; // 返回成功
  } catch (error) {
    console.error('Error getReportAgentsInQueueStatistics request:', error.message);
    return { success: false, error: { status: error.status, message: `Error getReportAgentsInQueueStatistics request: ${error.message}` } }; // 返回錯誤
  }
}

// 取得 Agent 使用者
async function getUsers (token, agentDn) {
  try {
    const response = await axios.get(`${host}/xapi/v1/Users?$filter=Number eq '${agentDn}'&$expand=ForwardingProfiles`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    // console.log('成功 獲取當前 Queues 的列表:', response.data);
    // 回傳 API 的回應
    return { success: true, data: response.data }; // 返回成功
  } catch (error) {
    console.error('Error getUsers request:', error.message);
    return { success: false, error: { status: error.status, message: `Error getUsers request: ${error.message}` } }; // 返回錯誤
  }
};

module.exports = {
  activeCalls,
  activeCallId,
  getQueues,
  getQueuesById,
  getReportAgentsInQueueStatistics,
  getUsers
};