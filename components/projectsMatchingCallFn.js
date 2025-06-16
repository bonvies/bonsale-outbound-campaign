const { logWithTimestamp, errorWithTimestamp } = require('../util/timestamp.js');
const {
  updateCallStatus,
  updateBonsaleProjectAutoDialExecute,
  updateDialUpdate,
  updateVisitRecord
} = require('../services/bonsale.js');
const { hangupCall } = require('../services/callControl.js');
const { mainActionType } = require('../util/mainActionType.js');

async function projectsMatchingCallFn(projects, matchingCallResults) {
  try {
    const updatePromises = []; // 儲存要推送的 Promises API
    projects.forEach(async (project, projectIndex, projectArray ) => {
      // 專案狀態控制
      if (mainActionType(project.action) === 'pause' || mainActionType(project.action) === 'error') {
        // 如果專案狀態為 'paused' 或 'error' 就不要撥電話
        logWithTimestamp(`專案 ${project.projectId} 狀態為 'pause'，不進行任何操作`);
        return;
      }

      // 檢查專案是否有匹配的撥號物件
      const projectCalls = matchingCallResults.find(item => item.projectId === project.projectId);
      // logWithTimestamp(`檢查專案 ${project.projectId} 是否有匹配的撥號物件:`, projectCalls);

      if (projectCalls) {
        // 如果有匹配的撥號物件，則更新專案狀態
        // logWithTimestamp(`專案 ${project.projectId} 有匹配的撥號物件:`, projectCalls);
        // 更新專案狀態為 'active' 並儲存匹配的撥號物件
        projectArray[projectIndex] = {
          ...project,
          action: mainActionType(project.action) === 'pause' ? project.action : 'calling',
          projectCallData: projectCalls,
        };
      } else if (project.projectCallData) { // 找到之前記錄在專案的撥打資料 
        if (mainActionType(project.action) === 'waiting') {
          logWithTimestamp(`專案 ${project.projectId} 狀態為 'waiting'，代表已經 mackCall，還在等待 3cx 的 agent 回應`);
          return;
        }

        // 如果沒有匹配的撥號物件，但專案中有 projectCallData 'active' 並清除 projectCallData
        // logWithTimestamp(`專案 ${project.projectId} 沒有匹配的撥號物件`);
        updatePromises.push(
          updateCallStatus(
            project.projectCallData.projectId,
            project.projectCallData.customerId,
            project.projectCallData.activeCall?.Status === 'Talking' ? 1 : 2, // 判斷撥打狀態是否為成功接通
          ),
          updateBonsaleProjectAutoDialExecute(
            project.projectCallData.projectId,
            project.projectCallData.callFlowId,
          ),
        );

        if (project.projectCallData.activeCall && project.projectCallData.activeCall.Status !== 'Talking') {
          // 如果撥打狀態為不成功接通 要發送 API 更新 dialUpdate
          updatePromises.push(
            updateDialUpdate(
              project.projectCallData.projectId,
              project.projectCallData.customerId
            )
          );
        } else if (project.projectCallData.activeCall && project.projectCallData.activeCall.Status === 'Talking') {
          // 如果撥打狀態為成功接通 要發送 API 更新 訪談紀錄
          if (!project.projectCallData?.activeCall?.LastChangeStatus) throw new Error('LastChangeStatus is undefined'); 
          
          /*
            這是因為後端在 updateCallStatus 也會抓訪談紀錄 這時如果我太快 updateVisitRecord
            VisitRecord 會抓到舊的 CallStatus 導致 CallStatus 還是會被寫入 0
            所以才需要我這邊  延遲更新訪談紀錄
          */

          // 定義一個延遲更新訪談紀錄的函數
          function delayUpdateVisitRecord (ms, item) {
            return new Promise((resolve) => {
              setTimeout(() => {
                console.log('延遲更新訪談紀錄');
                updateVisitRecord(
                  item.projectCallData?.projectId,
                  item.projectCallData?.customerId,
                  'intro',
                  'admin',
                  item.projectCallData?.activeCall?.LastChangeStatus,
                  '撥打成功',
                  '撥打成功'
                );
                resolve();
              }, ms);
            });
          }
          
          updatePromises.push(
            delayUpdateVisitRecord(100, project) // 延遲 100 毫秒更新訪談紀錄
            // updateVisitRecord(
            //   project.projectCallData.projectId,
            //   project.projectCallData.customerId,
            //   'intro',
            //   'admin',
            //   project.projectCallData?.activeCall?.LastChangeStatus,
            //   '撥打成功',
            //   '撥打成功'
            // )
          );
        }

        // 等待所有的 API 請求完成
        // 逐行（依序）執行
        (async () => {
          for (const promise of updatePromises) {
            await promise; // 一個一個來
          }
        })();

        projectArray[projectIndex] = {
          ...project,
          action: mainActionType(project.action) === 'pause' ? mainActionType(project.action) : 'recording', // 更新狀態為 'recording'
          projectCallData: null,
          currentMakeCall: null, // 清除 currentMakeCall 狀態
        };
      } else {
        if (mainActionType(project.action) === 'waiting') {
          logWithTimestamp(`專案 ${project.projectId} 狀態為 'waiting'，代表已經 mackCall，還在等待 3cx 的 agent 回應`);
          return;
        }
        if (mainActionType(project.action) === 'error') {
          logWithTimestamp(`專案 ${project.projectId} 狀態為 'error' 或 'errored'，代表撥打失敗，等待重新嘗試`);
          return;
        }

        // 如果沒有匹配的撥號物件，則更新專案狀態為 'start'
        logWithTimestamp(`專案 ${project.projectId} 沒有匹配的撥號物件，更新狀態為 'active'`);
        projectArray[projectIndex] = {
          ...project,
          action: mainActionType(project.action) === 'pause' ? project.action : 'active', // 暫停並掛斷電話後要繼續跑流程紀錄等等 只是不要在撥打電話而已
          projectCallData: null, // 清除 projectCallData
          currentMakeCall: null, // 清除 currentMakeCall 狀態
        };
      }
    });
  } catch (error) {
    errorWithTimestamp(`projectsMatchingCallFn 發生錯誤: ${error.message}`);
    throw new Error(`projectsMatchingCallFn 發生錯誤: ${error.message}`);
  }

};

module.exports = { projectsMatchingCallFn };