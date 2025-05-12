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
    return response.data;
  } catch (error) {
    console.error('Error activeCalls request:', error.message);
    return error
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
    return response.data;
  } catch (error) {
    console.error('Error ActiveCallId request:', error.message);
    return error
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
    return { success: true, data: response.data }; // 返回成功的 queues
  } catch (error) {
    console.error('Error Queues request:', error.message);
    return { success: false, error: { status: error.status, message: `Error getQueues request: ${error.message}` } }; // 返回错误
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
    return { success: false, error: { status: error.status, message: `Error getQueuesById request: ${error.message}` } }; // 返回错误
  }
};

module.exports = {
  activeCalls,
  activeCallId,
  getQueues,
  getQueuesById
};