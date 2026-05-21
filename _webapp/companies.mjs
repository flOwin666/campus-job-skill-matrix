/**
 * companies.mjs — 配置层（从 companies.json 动态读取，只维护一个数据源）
 */
import data from './companies.json' with { type: 'json' };
export const COMPANIES = data;
