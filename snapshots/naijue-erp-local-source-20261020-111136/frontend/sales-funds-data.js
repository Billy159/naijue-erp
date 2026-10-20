/* Fail-closed source snapshot stub. Real account values are intentionally omitted. */
(function(){
  function unavailable(){ const error=new Error("PRIVATE_CONFIGURATION_REQUIRED"); error.code="PRIVATE_CONFIGURATION_REQUIRED"; throw error; }
  window.SALES_FUNDS_RUNTIME=Object.freeze({fromService:unavailable});
})();
