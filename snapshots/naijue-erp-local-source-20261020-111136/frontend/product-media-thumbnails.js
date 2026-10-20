/* Fail-closed snapshot stub. Product-media index and uploaded image references are omitted. */
(function(){
  function unavailable(){ const error=new Error("PRIVATE_MEDIA_OMITTED"); error.code="PRIVATE_MEDIA_OMITTED"; throw error; }
  window.PRODUCT_MEDIA=Object.freeze({thumbnail:unavailable});
})();
