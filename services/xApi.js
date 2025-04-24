const axios = require('axios');
require('dotenv').config();

const host = process.env.HTTP_HOST_3CX;

// 掛斷當前撥號的對象
async function activeCalls (token) {
  try {
    const response = await axios.post(`${host}/xapi/v1/ActiveCalls`, {}, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    console.log('成功 獲取當前活躍呼叫的列表:', response.data);
    // 回傳 API 的回應
    return response.data;
  } catch (error) {
    console.error('Error hangupCall request:', error.message);
    throw new Error('Failed to hangupCall');
  }
};

module.exports = {
  activeCalls
};