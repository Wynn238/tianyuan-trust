'use strict';
const crypto = require('crypto');
const RAW = process.env.TY_CONFIG_KEY || process.env.TY_SESSION_SECRET || 'tianyuan-local-config-key-change-in-production';
const KEY = crypto.createHash('sha256').update(RAW).digest();
const PREFIX = 'enc:v1:';

function encrypt(text) {
  if (!text) return '';
  if (String(text).startsWith(PREFIX)) return String(text);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const body = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return PREFIX + iv.toString('base64url') + ':' + cipher.getAuthTag().toString('base64url') + ':' + body.toString('base64url');
}

function decrypt(value) {
  if (!value) return '';
  const str = String(value);
  if (!str.startsWith(PREFIX)) return str;
  const parts = str.slice(PREFIX.length).split(':');
  if (parts.length !== 3) return '';
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(parts[0], 'base64url'));
    decipher.setAuthTag(Buffer.from(parts[1], 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64url')), decipher.final()]).toString('utf8');
  } catch (e) { return ''; }
}

module.exports = { encrypt, decrypt, PREFIX };
