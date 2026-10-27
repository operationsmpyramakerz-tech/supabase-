// Pure, shared quantity model: historical signed receipts are never overwritten.
export function reconciliationBalance(planned,gross,returned,reserved=0){
 const finite=v=>Number.isSafeInteger(Number(v))&&Number(v)>=0 ? Number(v) : 0;
 const target=finite(planned),accepted=finite(gross)-finite(returned),pending=finite(reserved);
 return {planned:target,gross:finite(gross),returned:finite(returned),net:accepted,
   reserved:pending,outstanding:Math.max(0,target-accepted-pending),overReceived:Math.max(0,accepted-target)};
}
