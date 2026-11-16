// Adapters for SAP S/4HANA and IBM Maximo. Stubs: the interface and the TODOs, no live calls. Selecting one without credentials
// answers 501 "not configured"; with credentials it answers 501 "not implemented" until the TODOs are done. Neither makes a network
// request, and neither ever returns or logs a credential.
//
// The environment variable names are listed in .env.example. Values are never kept in the repository.

import { ErpError, ENTITIES, checkAdapter } from './adapter.js';

function stub({ name, label, required, todo }) {
  const configured = (env = process.env) => required.every((k) => Boolean(env[k]));
  const fail = (env) => {
    if (!configured(env)) throw new ErpError(501, 'not_configured', `${label} is selected but not configured. Set ${required.join(', ')} (see .env.example).`);
    throw new ErpError(501, 'not_implemented', `${label}: the live adapter is not written yet. ${todo}`);
  };
  const adapter = { name, label, live: true, configured, required, todo };
  for (const e of ENTITIES) adapter[e] = async (env = process.env) => fail(env);
  return checkAdapter(adapter);
}

export const sapS4Hana = () => stub({
  name: 'sap-s4hana', label: 'SAP S/4HANA',
  required: ['SAP_BASE_URL', 'SAP_AUTH_TYPE'],
  todo: 'TODO: OData V2 calls to API_MAINTENANCEORDER, API_MAINTNOTIFICATION, API_MATERIAL_STOCK_SRV, API_PURCHASEORDER_PROCESS_SRV (or API_PURCHASEORDER, V4), API_BUSINESS_PARTNER and the functional location / equipment services; authentication per SAP_AUTH_TYPE (basic, OAuth client credentials); paging with $top/$skip; read-only (GET only).',
});

export const maximo = () => stub({
  name: 'maximo', label: 'IBM Maximo',
  required: ['MAXIMO_BASE_URL', 'MAXIMO_API_KEY'],
  todo: 'TODO: REST calls to mxapiwodetail, mxapiasset, the inventory object structures, purchase orders and companies; apikey header from MAXIMO_API_KEY; oslc paging; read-only (GET only); then write mapping/maximo.json.',
});
