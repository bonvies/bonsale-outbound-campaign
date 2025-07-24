const axios = require('axios');
require('dotenv').config();

const host = process.env.BONSALE_HOST;
const xApiKey = process.env.BONSALE_X_API_KEY;
const xApiSecret = process.env.BONSALE_X_API_SECRET;

const axiosBonsaleInstance = axios.create({
  baseURL: host,
  headers: {
    'X-API-KEY': xApiKey,
    'X-API-SECRET': xApiSecret,
  },
});

async function getOutbound (callFlowId, projectId, callStatus, limit = 1) {
  try {
    const queryString = new URLSearchParams({
      callFlowIdOutbound: callFlowId,
      projectIdOutbound: projectId,
      callStatus,
      limit
    }).toString();
    const outboundResult = await axiosBonsaleInstance.get(`${host}/outbound?${queryString}`);
    const outboundProject = outboundResult.data;
    // console.log('參與者資訊：', response.data);
    return { success: true, data: outboundProject }; // 返回成功
  } catch (error) {
    console.error('Error getOutbound request:', error.message);
    return { success: false, error: { status: error.status, message: `Error getOutbound request: ${error.message}` } }; // 返回錯誤
  }
};

async function updateCallStatus (projectId, customerId, callStatus) {
  try {
    const response = await axiosBonsaleInstance.put(`${host}/project/${projectId}/customer/${customerId}/callStatus`, { callStatus });
    return { success: true, data: response.data }; // 返回成功
  } catch (error) {
    console.error('Error updateCallStatus request:', error.message);
    return { success: false, error: { status: error.status, message: `Error updateCallStatus request: ${error.message}` } }; // 返回錯誤
  }
}

async function updateBonsaleProjectAutoDialExecute (projectId, callFlowId) {
  try {
    const response = await axiosBonsaleInstance.put(`${host}/project/${projectId}/auto-dial/${callFlowId}/execute`, {});
    return { success: true, data: response.data }; // 返回成功
  } catch (error) {
    console.error('Error updateBonsaleProjectAutoDialExecute request:', error.message);
    return { success: false, error: { status: error.status, message: `Error updateBonsaleProjectAutoDialExecute request: ${error.message}` } }; // 返回錯誤
  }
}

async function updateDialUpdate (projectId, customerId) {
  try {
    const response = await axiosBonsaleInstance.put(`${host}/project/${projectId}/customer/${customerId}/dialUpdate`, {});
    return { success: true, data: response.data }; // 返回成功
  } catch (error) {
    console.error('Error updateDialUpdate request:', error.message);
    return { success: false, error: { status: error.status, message: `Error updateDialUpdate request: ${error.message}` } }; // 返回錯誤
  }
}

async function updateVisitRecord (
  projectId,
  customerId,
  visitType,
  visitedUsername,
  visitedAt,
  description,
  visitedResult,
  task
) {
  try {
    const payload = {
      projectId,
      customerId,
      visitType,
      visitedUsername,
      visitedAt,
      description,
      visitedResult,
    };
    if (task !== undefined) {
      payload.task = task;
    }
    const response = await axios.post(`${host}/project/customer/visit`, payload);
    return { success: true, data: response.data }; // 返回成功
  } catch (error) {
    console.error('Error updateVisitRecord request:', error.message);
    return { success: false, error: { status: error.status, message: `Error updateVisitRecord request: ${error.message}` } }; // 返回錯誤
  }
}

async function getBonsaleConfig (configName) {
  try {
    const response = await axiosBonsaleInstance.get(`${host}/config/${configName}`);
    return { success: true, data: response.data }; // 返回成功
  } catch (error) {
    console.error('Error getBonsaleConfig request:', error.message);
    return { success: false, error: { status: error.status, message: `Error getBonsaleConfig request: ${error.message}` } }; // 返回錯誤
  }
}

async function updateBonsaleConfig (configName, configData) {
  try {
    const response = await axiosBonsaleInstance.put(`${host}/config/${configName}`, {
      configName: configName,
      configValue: configData,
      description: '專案自動外播-執行專案暫存',
    });
    return { success: true, data: response.data }; // 返回成功
  } catch (error) {
    console.error('Error updateBonsaleConfig request:', error.message);
    return { success: false, error: { status: error.status, message: `Error updateBonsaleConfig request: ${error.message}` } }; // 返回錯誤
  }
}

module.exports = {
  getOutbound,
  getBonsaleConfig,
  updateBonsaleConfig,
  updateCallStatus,
  updateBonsaleProjectAutoDialExecute,
  updateDialUpdate,
  updateVisitRecord
};