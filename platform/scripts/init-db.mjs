import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const database = require('../lib/database.js');

try {
  const db = await database.load();
  const counts = {
    farmers: Array.isArray(db.farmers) ? db.farmers.length : 0,
    products: Array.isArray(db.products) ? db.products.length : 0,
    users: Array.isArray(db.users) ? db.users.length : 0,
  };
  console.log(`演示数据已初始化：${counts.users} 个账号 / ${counts.farmers} 个农户 / ${counts.products} 个商品`);
  process.exit(0);
} catch (error) {
  console.error('演示数据初始化失败：', error.message);
  process.exit(1);
}
