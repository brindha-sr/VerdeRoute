// Quick patch script to diagnose and fix traffic key issue
// Run this in the browser console to understand the problem

console.log('=== TOMTOM_CONFIG Check ===');
console.log('TOMTOM_CONFIG:', typeof TOMTOM_CONFIG !== 'undefined' ? TOMTOM_CONFIG : 'NOT DEFINED');
console.log('TOMTOM_CONFIG.PRIMARY_KEY:', typeof TOMTOM_CONFIG !== 'undefined' ? TOMTOM_CONFIG.PRIMARY_KEY : 'N/A');

console.log('\n=== getTomTomKeyPair() Check ===');
console.log('getTomTomKeyPair():', typeof getTomTomKeyPair === 'function' ? getTomTomKeyPair() : 'FUNCTION NOT FOUND');

console.log('\n=== TRAFFIC_KEY Status ===');
console.log('TRAFFIC_KEY:', TRAFFIC_KEY);

console.log('\n=== Manually Set TRAFFIC_KEY ===');
if (typeof TOMTOM_CONFIG !== 'undefined' && TOMTOM_CONFIG.PRIMARY_KEY) {
  window.TRAFFIC_KEY = TOMTOM_CONFIG.PRIMARY_KEY;
  console.log('✓ TRAFFIC_KEY set to:', TRAFFIC_KEY);
  console.log('Now try clicking the Live Traffic button again.');
} else {
  console.error('✗ Cannot find TOMTOM_CONFIG.PRIMARY_KEY');
}
