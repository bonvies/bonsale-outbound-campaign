const express = require('express');
const WebSocket = require('ws');
const router = express.Router();
const {
  activeCalls,
} = require('../services/xApi.js');
const lodash = require('lodash');
const { autoOutbound } = require('../components/autoOutbound.js');
const throttledAutoOutbound = lodash.throttle(autoOutbound, 30, { trailing: false });

const { getTaiwanTimestamp, logWithTimestamp, warnWithTimestamp, errorWithTimestamp } = require('../util/timestamp.js');
const { projectsMatchingCallFn } = require('../components/projectsMatchingCallFn.js');
const { mainActionType } = require('../util/mainActionType.js');
const { hangupCall } = require('../services/callControl.js');

const { get3cxToken } = require('../services/callControl.js');
const { sendDiscordMessage } = require('../util/discordNotify.js');
const { getBonsaleConfig, updateBonsaleConfig } = require('../services/bonsale.js');

require('dotenv').config();

const CALL_GAP_TIME = Number(process.env.CALL_GAP_TIME) || 1; // 預設 1 秒

// 創建 WebSocket Server
const clientWsProjectOutbound = new WebSocket.Server({ noServer: true });

clientWsProjectOutbound.on('connection', (ws) => {
  logWithTimestamp('WebSocket Server - clientWsProjectOutbound: Client connected');

  ws.on('close', () => {
    logWithTimestamp('WebSocket Server - clientWsProjectOutbound: Client disconnected');
  });
});

let isApiRunning = false; // 用來判斷 API 是否正在運行
let isAutoDialProcessing = false; // 用來判斷自動撥號是否正在執行

let globalToken = null;

const activeCallQueue = []; // 儲存活躍撥號的佇列

let bonsaleConfig = null;

let isProjectErrorAutoRestart = process.env.IS_PROJECT_ERROR_AUTO_RESTART === 'true' ? true : false; // 是否啟用專案錯誤自動重啟功能

let projects = []; // 一開始設為空陣列
/* 
  projects 的資料結構
  {
    grant_type: 'client_credentials’,
    client_secret: '3CX API Key',
    callFlowId: 'callFlow 的 ID',
    projectId: '專案的 ID',
    action: '專案的狀態',
    projectCallData: null,
    currentMakeCall: null,
    error: null,
    _toCall: {
      phone: '',
      customerId: ''
    },
    _makeCallTimes: 1753264804907
  }
 */

// 初始化專案資料 如果有快取之前的專案就引用
(async () => {
  try {
    bonsaleConfig = await getBonsaleConfig(process.env.BONSALE_CONFIG_NAME);

    if (bonsaleConfig && bonsaleConfig.data && bonsaleConfig.data.confValue) {
      projects = JSON.parse(bonsaleConfig.data.confValue) || [];
    } else {
      projects = [];
    }
  } catch (err) {
    projects = [];
    errorWithTimestamp('初始化專案資料失敗:', err);
  }
})();

const discordBotToken = process.env.DISCORD_BOT_TOKEN;

if (discordBotToken) {
  // 預設每 5 分鐘檢查一次
  const discordErrorAlertGapTime = process.env.DISCORD_ERROR_ALERT_GAP_TIME || 300; 
  // 記錄每個 projectId 上次通知的錯誤內容
  const lastErrorMap = new Map();

  // 週期性偵測 projects 錯誤 並發送 Discord 通知
  setInterval(() => {
    projects.forEach(project => {
      if (project.error) {
        // 取得上次通知的錯誤內容
        const lastError = lastErrorMap.get(project.projectId);
        // 如果錯誤內容不同，才發送通知
        if (lastError !== project.error) {
          const now = getTaiwanTimestamp();
          sendDiscordMessage(`[${now}] 偵測到專案 ${project.projectId} 發生錯誤: ${project.error}`);
          lastErrorMap.set(project.projectId, project.error);
        }
      } else {
        // 沒有錯誤就移除記錄
        if (lastErrorMap.has(project.projectId)) {
          lastErrorMap.delete(project.projectId);
        }
      }
    });
  }, discordErrorAlertGapTime * 1000);
}

async function getGlobalToken() {
  const grant_type = process.env.ADMIN_3CX_GRANT_TYPE;
  const client_id = process.env.ADMIN_3CX_CLIENT_ID;
  const client_secret = process.env.ADMIN_3CX_CLIENT_SECRET;
  if (!grant_type || !client_id || !client_secret) {
    errorWithTimestamp('Missing required fields for 3CX token');
    return null; // 如果缺少必要的欄位，就不進行後續操作
  }

  const fetch_get3cxToken = await get3cxToken(grant_type, client_id, client_secret);

    if (!fetch_get3cxToken.success) {
      errorWithTimestamp('獲取 3CX token 失敗:', fetch_get3cxToken.error.message);
      return null; // 如果獲取 token 失敗，就不進行後續操作
    };

    const token = fetch_get3cxToken.data.access_token; // 更新 globalToken

  return token;
}

async function projectsIntervalAutoOutbound() {
  // 如果沒有專案，就不進行撥號
  if (projects.length === 0) {
    logWithTimestamp('沒有專案，跳過自動撥號');
    return;
  }

  for (let projectIndex = 0; projectIndex < projects.length; projectIndex++) {
    const project = projects[projectIndex];
    // 隨機延遲 0-100 毫秒再執行 throttledAutoOutbound
    const randomDelay = Math.floor(Math.random() * 101); // 0~100 ms
    await new Promise(resolve => setTimeout(resolve, randomDelay));
    try {
      const called = await throttledAutoOutbound(project, projectIndex, projects, isProjectErrorAutoRestart);
      if (called) {
        projects[projectIndex].currentMakeCall = called.currentMakeCall; // 更新專案的 currentMakeCall 狀態
        activeCallQueue.push(called.addInActiveCallQueue);
      }
    } catch (err) {
      errorWithTimestamp(`自動外撥專案 [${project.projectId}] 發生錯誤:`, err.message);
    }
  }
}

// 每 CALL_GAP_TIME 秒 進行自動撥號 並 檢查撥號狀態
setInterval(async () => {
  // 如果前一輪自動撥號還在執行中，跳過本次執行
  if (isAutoDialProcessing) {
    logWithTimestamp('前一輪自動撥號還在執行中，跳過本次執行');
    return;
  }

  // 如果正在運行 API，就跳過本次自動撥號
  // 這是為了避免在 API 改變 project 狀態時，導致自動撥號的狀態不一致
  if (isApiRunning) {
    logWithTimestamp('API 正在運行，跳過本次自動撥號');
    return; // 如果 API 正在運行，就跳過本次自動撥號
  }

  isAutoDialProcessing = true; // 設置執行標誌
  
  try {
    console.log("================================Start================================");
    
    // 每 CALL_GAP_TIME 秒 專案進行自動撥號
    await projectsIntervalAutoOutbound();

    // logWithTimestamp(`每 ${CALL_GAP_TIME} 秒檢查一次撥號狀態`);
    if (!globalToken) { // 如果沒有 token 就 get3cxToken
      logWithTimestamp('沒有 globalToken，嘗試獲取 3CX token');
      const fetch_get3cxToken = await getGlobalToken();

      if (!fetch_get3cxToken) {
        errorWithTimestamp('獲取 3CX token 失敗，無法繼續執行自動撥號');
        return; // 如果獲取 token 失敗，就不進行後續操作
      };

      globalToken = fetch_get3cxToken; // 更新 globalToken
      logWithTimestamp('獲取 3CX token 成功:', globalToken);
      return;
    };

    // 獲取目前活躍的撥號狀態
    const fetch_getActiveCalls = await activeCalls(globalToken);
    logWithTimestamp('獲取目前活躍的撥號狀態:', fetch_getActiveCalls?.data?.value);

    // 如果 token 失效，清除 globalToken
    // 這邊的狀況是 token 失效了，這時候我們要重新拿 token 讓流程持續
    if (!fetch_getActiveCalls.success && fetch_getActiveCalls.error.status === 401) {
      warnWithTimestamp('3CX token 失效，重新拿 token 讓流程持續');
      const fetch_get3cxToken = await getGlobalToken();

      if (!fetch_get3cxToken) {
        errorWithTimestamp('獲取 3CX token 失敗，無法繼續執行自動撥號');
        return; // 如果獲取 token 失敗，就不進行後續操作
      };

      globalToken = fetch_get3cxToken; // 更新 globalToken
      return;
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
          callFlowId: queueItem.callFlowId,
          projectId: queueItem.projectId,
          customerId: queueItem.customerId,
          activeCall: matchingCall
        });
        
      } else {
        // logWithTimestamp(`移除無匹配的 callId: ${queueItem.callid}`);
        activeCallQueue.splice(i, 1); // 移除無匹配的項目
      }
    }
    // logWithTimestamp('匹配的撥號物件:', matchingCallResults);
    await projectsMatchingCallFn(projects, matchingCallResults);

    console.log("================================End================================");
  } catch (error) {
    errorWithTimestamp('Error while checking active calls:', error.message);
  } finally {
    isAutoDialProcessing = false; // 確保執行標誌被重置
    
    // 將匹配的撥號物件傳送給 WebSocket Server 的所有連線客戶端
    logWithTimestamp('自動外撥專案實況',projects);
    clientWsProjectOutbound.clients.forEach((client) => {
      const toClientProjects = projects.map(project => ({
        projectId: project.projectId,
        action: project.action,
        callFlowId: project.callFlowId,
        projectCallData: project.projectCallData,
      }));
      client.send(JSON.stringify(toClientProjects));
    });
  }
}, CALL_GAP_TIME * 1000); // 每 CALL_GAP_TIME 秒檢查一次撥號狀態


// project 同時備份至 bonsale config 紀錄
async function backupProjectsToBonsaleConfig() {
  try {
    const backupProject = projects.map(project => ({
      grant_type: project.grant_type,
      client_id: project.client_id,
      client_secret: project.client_secret,
      callFlowId: project.callFlowId,
      projectId: project.projectId,
      action: project.action,
      projectCallData: null, // 不需要備份 projectCallData
    }));

    const configName = process.env.BONSALE_CONFIG_NAME;
    const bonsaleConfig = await updateBonsaleConfig(configName, JSON.stringify(backupProject));
    logWithTimestamp('備份專案至 Bonsale config 成功:', bonsaleConfig);
  } catch (error) {
    errorWithTimestamp('Error while backing up projects to Bonsale config:', error.message);
  }
}

// projectOutbound API - 將專案加入自動撥號佇列
router.post('/', async function(req, res) {
  isApiRunning = true; // API 開始，設為 true
  try {
    const { grant_type, client_id, client_secret, callFlowId, projectId, action } = req.body;

    if (!grant_type || !client_id || !client_secret || !callFlowId || !projectId || !action) {
      errorWithTimestamp('Missing required fields');
      return res.status(400).send('Missing required fields');
    }
    // 檢查專案是否已存在
    const existingProject = projects.find(project => project.projectId === projectId);
    if (existingProject) {
      errorWithTimestamp(`Project with ID ${projectId} already exists`);
      return res.status(400).send(`Project with ID ${projectId} already exists`);
    }
    // 檢查 action 狀態是否正確
    if (action !== 'active' && action !== 'start' && action !== 'pause') {
      errorWithTimestamp(`Invalid action: ${action}. Action must be one of 'active', 'start', 'pause'`);
      return res.status(400).send(`Invalid action: ${action}. Action must be one of 'active', 'stop', 'pause'`);
    }
    // 新增專案到佇列
    projects.push({ grant_type, client_id, client_secret, callFlowId, projectId, action, projectCallData: null, });

    res.status(200).send({
      message: 'Request projectOutbound successfully'
    });
  } finally {
    isApiRunning = false; // API 結束，設為 false
  }
});

router.get('/isProjectErrorAutoRestart', async function(req, res) {
  try {
    res.status(200).send({
      isProjectErrorAutoRestart: isProjectErrorAutoRestart
    });
  } catch (err) {
    errorWithTimestamp('獲取專案錯誤自動重啟狀態失敗:', err.message);
    res.status(500).send('獲取專案錯誤自動重啟狀態失敗');
  }
});

// projectOutbound API - 變更是否啟用專案錯誤自動重啟功能
router.put('/isProjectErrorAutoRestart', async function(req, res) {
  isApiRunning = true; // API 開始，設為 true
  try {
    const { isEnabled } = req.body;
    if (typeof isEnabled !== 'boolean') {
      errorWithTimestamp('Invalid request body');
      return res.status(400).send('Invalid request body');
    }
    isProjectErrorAutoRestart = isEnabled;
    res.status(200).send({
      message: `Project error auto restart ${isProjectErrorAutoRestart ? 'enabled' : 'disabled'} successfully`
    });
  } finally {
    isApiRunning = false; // API 結束，設為 false
  }
});

// projectOutbound API - 改變專案資料
router.put('/:projectId', async function(req, res) {
  isApiRunning = true; // API 開始，設為 true
  try {
    const { projectId: paramsProjectId } = req.params;
    const { grant_type, client_id, client_secret, callFlowId, projectId } = req.body;
    if (!paramsProjectId || !grant_type || !client_id || !client_secret || !projectId || !callFlowId) {
      errorWithTimestamp('Missing required fields');
      return res.status(400).send('Missing required fields');
    }

    // 檢查專案是否已存在
    const existingProject = projects.find(project => project.projectId === paramsProjectId);
    if (!existingProject) {
      errorWithTimestamp(`Project with ID ${projectId} is not exists`);
      return res.status(400).send(`Project with ID ${projectId} is not exists`);
    }

    // 如果已存在，則更新該專案的資料，但保留原本的 projectCallData
    const updatedProject = {
      grant_type,
      client_id,
      client_secret,
      callFlowId,
      projectId,
      action: existingProject.action, // 保留原本的 action 狀態
      projectCallData: existingProject.projectCallData // 保留原本的 projectCallData
    };
    const index = projects.findIndex(project => project.projectId === paramsProjectId);
    if (index !== -1) {
      projects[index] = updatedProject;
    }

    res.status(200).send({
      message: `Project ${projectId} updated successfully`,
      project: updatedProject
    });
  } finally {
    isApiRunning = false; // API 結束，設為 false
  }
  
});

// projectOutbound API - 改變專案狀態
router.patch('/:projectId', async function(req, res) {
  isApiRunning = true; // API 開始，設為 true
  try {
    const { projectId } = req.params;
    const { action } = req.body; 
    // action 有 以下種狀態
    // active: 激活撥號
    // start: 開始撥號
    // stop: 停止撥號
    // pause: 暫停撥號
    // calling: 正在撥號
    // waiting: 等待撥號
    // recording: 開始紀錄
    if (!projectId || !action) {
      errorWithTimestamp('Missing required fields');
      return res.status(400).send('Missing required fields');
    }

    // 限制只能改變特定 action 狀態
    if (!['active', 'start', 'pause'].includes(action)) {
      errorWithTimestamp(`Invalid action: ${action}. Action must be one of 'active', 'start', 'pause'`);
      return res.status(400).send(`Invalid action: ${action}. Action must be one of 'active', 'start', 'pause'`);
    }

    // 如果狀態是 'pause'，則要掛斷電話
    if (action === 'pause') {
      const project = projects.find(project => project.projectId === projectId);
      if (!project) {
        errorWithTimestamp(`Project with ID ${projectId} not found`);
        return res.status(404).send(`Project with ID ${projectId} not found`);
      }

      // 如果專案有正在撥打的電話，則掛斷電話
      if (project.currentMakeCall && project.currentMakeCall.token) {
        try {
          const { token, dn, id } = project.currentMakeCall;
          await hangupCall(token, dn, id);
          logWithTimestamp(`Project ${projectId} call with callid ${project.currentMakeCall.callid} has been hung up`);
          // 清除專案的 currentMakeCall 狀態
          project.currentMakeCall = null;
        } catch (error) {
          errorWithTimestamp(`Failed to hang up call for project ${projectId}: ${error.message}`);
          return res.status(500).send(`Failed to hang up call for project ${projectId}: ${error.message}`);
        }
      }
    }

    // projectOutbound API - 找到對應的專案並更新 action 狀態
    const projectIndex = projects.findIndex(project => project.projectId === projectId);
    if (projectIndex === -1) {
      errorWithTimestamp(`Project with ID ${projectId} not found`);
      return res.status(404).send(`Project with ID ${projectId} not found`);
    }

    projects[projectIndex].action = action;

    res.status(200).send({
      message: `Project ${projectId} updated successfully`,
      project: projects[projectIndex]
    });
  } finally {
    isApiRunning = false; // API 結束，設為 false
  }
});

// projectOutbound API - 刪除專案
router.delete('/:projectId', async function(req, res) {
  isApiRunning = true; // API 開始，設為 true
  try {
    const { projectId } = req.params;
    // action 有 以下種狀態
    // active: 激活撥號
    // start: 開始撥號
    // stop: 停止撥號
    // pause: 暫停撥號
    // calling: 正在撥號
    // waiting: 等待撥號
    // recording: 開始紀錄
    if (!projectId) {
      errorWithTimestamp('Missing required fields');
      return res.status(400).send('Missing required fields');
    }

    // 檢查專案是否已存在
    const existingProject = projects.find(project => project.projectId === projectId);
    if (!existingProject) {
      errorWithTimestamp(`Project with ID ${projectId} is not exists`);
      return res.status(400).send(`Project with ID ${projectId} is not exists`);
    }

    // 限制只有專案狀態為 pause 才能刪除
    if (mainActionType(existingProject.action) !== 'pause') {
      errorWithTimestamp(`Project with ID ${projectId} is not in 'pause' state, cannot be deleted`);
      return res.status(400).send(`Project with ID ${projectId} is not in 'pause' state, cannot be deleted`);
    }
    
    // 從專案列表中刪除該專案
    const projectIndex = projects.findIndex(project => project.projectId === projectId);
    if (projectIndex === -1) {
      errorWithTimestamp(`Project with ID ${projectId} not found`);
      return res.status(404).send(`Project with ID ${projectId} not found`);
    }
    projects.splice(projectIndex, 1);

    res.status(200).send({
      message: `Project ${projectId} delete successfully`,
    });
  } finally {
    isApiRunning = false; // API 結束，設為 false
  }
});

module.exports = { 
  router, 
  clientWsProjectOutbound,
  backupProjectsToBonsaleConfig
};
