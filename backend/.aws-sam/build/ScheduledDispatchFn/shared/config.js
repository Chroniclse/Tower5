// Reads the single config item and resolves the dropdown options a given role sees.
const { GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { doc, TABLES } = require('./db');

const CONFIG_KEY = 'global';

// The defaults mirror the prototype in nett-admin.html so a fresh deploy matches the mock.
const DEFAULT_CONFIG = {
  configKey: CONFIG_KEY,
  tags: {
    phase: ['Development', 'Pre-Production', 'Principal Photography', 'Post-Production', 'Distribution'],
    track: ['Creative', 'Technical / Production', 'Legal', 'Compliance', 'Knowledge Management'],
    priority: ['Volumetric Data', 'Performance Capture', 'Visual Consistency', 'Asynchronous Assembly', 'AI Integration'],
  },
  roleOverrides: {},   // { 'Director': { track: [...], priority: [...] }, ... }
  examples: {
    Director: 'Testing gen AI tools for video rendering, applying standard criteria. Main tools tested are Seedance, Veo, Kling, WAN and Minimax. Working with Tom and Roberto. Discovered major differences in the degree of control, ease of use and fidelity.',
    Editor: 'Using gen AI tools for storyboarding and previz. Working with AD and production designer. Because of the learning curve, it takes more time than normal to achieve my desired vision, but the tools have also helped generate new ideas.',
    'Legal / Compliance': 'Reviewing the contracts of tool vendors for indemnification. Creating a table to track and compare each contract. Every contract uses different wording. Most provide protection, but a few are unclear.',
    default: 'Describe what you worked on, why, with whom, your approach, the tools used, any challenges, and your insights so far.',
  },
};

async function getConfig() {
  const { Item } = await doc.send(new GetCommand({
    TableName: TABLES.config,
    Key: { configKey: CONFIG_KEY },
  }));
  return Item || DEFAULT_CONFIG;
}

async function putConfig(config) {
  const item = { ...config, configKey: CONFIG_KEY };
  await doc.send(new PutCommand({ TableName: TABLES.config, Item: item }));
  return item;
}

// Global options + this role's overrides, merged & de-duped.
function optionsForRole(config, role) {
  const ov = (config.roleOverrides && config.roleOverrides[role]) || {};
  const merge = (key) => [...new Set([...(config.tags[key] || []), ...((ov[key]) || [])])];
  return { phase: merge('phase'), track: merge('track'), priority: merge('priority') };
}

module.exports = { getConfig, putConfig, optionsForRole, DEFAULT_CONFIG, CONFIG_KEY };
