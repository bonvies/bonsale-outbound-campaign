const axios = require('axios');
require('dotenv').config();

const host = process.env.HTTP_HOST_3CX;

// 查詢當前活躍呼叫的列表
async function activeCalls (token, callid) {
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
    console.error('Error ActiveCalls request:', error.message);
    throw new Error('Failed to ActiveCalls');
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
    return response.data;
  } catch (error) {
    console.error('Error Queues request:', error.message);
    throw new Error('Failed to Queues');
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
    return response.data;
  } catch (error) {
    console.error('Error Queues request:', error.message);
    throw new Error('Failed to Queues');
  }
};

module.exports = {
  activeCalls,
  getQueues,
  getQueuesById
};