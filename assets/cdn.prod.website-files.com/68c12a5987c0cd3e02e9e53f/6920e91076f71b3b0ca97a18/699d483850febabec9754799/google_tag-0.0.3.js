var currentScript = document.currentScript;
var tagID = currentScript ? currentScript.getAttribute('data-gtag-id') : null;

if (!tagID) {
  console.error('Google Tag ID is required but not found in data-gtag-id attribute');
} else {
  // Dynamically load the gtag.js script.
  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + tagID;
  document.head.appendChild(script);

  // Initialize gtag.
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}

  // Set the developer ID for the App.
  gtag('set', 'developer_id.dMDgyOG', true);

  gtag('js', new Date());
  gtag('config', tagID);
}