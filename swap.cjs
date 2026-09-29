const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const orderTypeRegex = /(<!-- -- Pickup or Delivery -- -->[\s\S]*?)(?=<!-- -- Date & Time -- -->)/;
const dateTimeRegex = /(<!-- -- Date & Time -- -->[\s\S]*?)(?=<button type=\"button\" class=\"place-order-btn\")/;

const orderTypeMatch = html.match(orderTypeRegex);
const dateTimeMatch = html.match(dateTimeRegex);

if (orderTypeMatch && dateTimeMatch) {
  let orderTypeStr = orderTypeMatch[1];
  let dateTimeStr = dateTimeMatch[1];
  
  orderTypeStr = orderTypeStr.replace('<div class=\"step-num\">2</div>', '<div class=\"step-num\">3</div>');
  dateTimeStr = dateTimeStr.replace('<div class=\"step-num\">3</div>', '<div class=\"step-num\">2</div>');

  html = html.replace(orderTypeRegex, '[[ORDER_TYPE_PLACEHOLDER]]');
  html = html.replace(dateTimeRegex, '[[DATE_TIME_PLACEHOLDER]]');
  
  html = html.replace('[[ORDER_TYPE_PLACEHOLDER]]', dateTimeStr);
  html = html.replace('[[DATE_TIME_PLACEHOLDER]]', orderTypeStr);
  
  fs.writeFileSync('index.html', html);
  console.log('Swapped successfully');
} else {
  console.log('Could not find matches');
}

