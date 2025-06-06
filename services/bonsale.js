const axios = require('axios');
require('dotenv').config();

const host = process.env.BONSALE_HOST;
const xApiKey = process.env.BONSALE_X_API_KEY;
const xApiSecret = process.env.BONSALE_X_API_SECRET;

async function getOutbound (callFlowId, projectId, callStatus, limit = 1) {
  try {
    const queryString = new URLSearchParams({
      callFlowIdOutbound: callFlowId,
      projectIdOutbound: projectId,
      callStatus,
      limit
    }).toString();
    const outboundResult = await axios.get(`${host}/outbound?${queryString}`, {
      headers: {
        'X-API-KEY': xApiKey,
        'X-API-SECRET': xApiSecret,
      }
    });
    const outboundProject = outboundResult.data;
    // console.log('參與者資訊：', response.data);
    return { success: true, data: outboundProject }; // 返回成功
  } catch (error) {
    console.error('Error getOutbound request:', error.message);
    return { success: false, error: { status: error.status, message: `Error getOutbound request: ${error.message}` } }; // 返回錯誤
  }
};

module.exports = {
  getOutbound,
};