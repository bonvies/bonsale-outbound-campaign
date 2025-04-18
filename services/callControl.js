const axios = require('axios');
require('dotenv').config();

const host = process.env.API_HOST;

// 取得 3CX token
async function get3cxToken (grant_type, client_id, client_secret) {
  try {
    const params = new URLSearchParams();
    params.append('grant_type', grant_type);
    params.append('client_id', client_id);
    params.append('client_secret', client_secret);

    const response = await axios.post(`${host}/connect/token`, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    // console.log('取得 3CX token 成功:', response.data.access_token);
    return response.data.access_token;
  } catch (error) {
    console.error('Error get3cxToken request:', error.message);
    throw new Error('Failed to fetch token');
  }
};

// 撥打電話
async function makeCall (token, dn, device_id, reason, destination, timeout = 30) {
  try {
    const response = await axios.post(`${host}/callcontrol/${dn}/devices/${device_id}/makecall`, {
      reason,
      destination,
      timeout
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    // 回傳 API 的回應
    return response.data;
  } catch (error) {
    console.error('Error makeCall request:', error.message);
    throw new Error('Failed to makecall');
  }
};

// 掛斷當前撥號的對象
async function hangupCall (token, dn, id) {
  try {
    const response = await axios.post(`${host}/callcontrol/${dn}/participants/${id}/drop`, {}, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    console.log('成功 掛斷電話請求:', response.data);
    // 回傳 API 的回應
    return response.data;
  } catch (error) {
    console.error('Error hangupCall request:', error.message);
    throw new Error('Failed to hangupCall');
  }
};

async function getCaller (token) {
  try {
    const response = await axios.get(`${host}/callcontrol`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const caller = response.data.find(item => item.type === 'Wqueue');
    if (!caller) {
      throw new Error('Caller not found');
    }

    return caller;
  } catch (error) {
    console.error('Error getCaller request:', error.message);
    throw new Error('Failed to getCaller data');
  } 
};

async function getParticipants (token, dn) {
  try {
    const response = await axios.get(`${host}/callcontrol/${dn}/participants`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    // console.log('參與者資訊：', response.data);
    return response.data;
  } catch (error) {
    console.error('Error getParticipants request:', error.message);
    throw new Error('Failed to get participants');
  }
};

module.exports = {
  get3cxToken,
  makeCall,
  hangupCall,
  getCaller,
  getParticipants
};