import Resource from '@rancher/ember-api-store/models/resource';
import { computed, get, set, observer } from '@ember/object';
import moment from 'moment';
import { downloadFile } from 'shared/utils/download-files';
import ObjectsToCsv from 'objects-to-csv';

export default Resource.extend({
  type:          'clusterScan',
  report:        'null',
  reportPromise: null,
  total:         computed.alias('summary.total'),
  passed:        computed.alias('summary.passed'),
  skipped:       computed.alias('summary.skipped'),
  failed:        computed.alias('summary.failed'),

  isRunning: computed.equal('state', 'activating'),

  loader: observer('store', 'state', function() {
    this.loadReport();
  }),

  file: computed('report', 'name', function(){
    return {
      name: `${ get(this, 'name') }.csv`,
      file:  get(this, 'resultsForCsv')
    };
  }),

  csvFile: computed('file', async function() {
    const file = get(this, 'file');

    return {
      ...file,
      file: await (new ObjectsToCsv(file.file).toString())
    }
  }),

  availableActions: computed(() => {
    return [
      {
        sort:     97,
        label:    'action.download',
        icon:     'icon icon-download',
        action:   'download',
        bulkable: true,
        enabled:  true,
      }
    ]
  }),

  referencedResults: computed('report', function() {
    const results = (get(this, 'report.results') || [])
      .map((result) => result.checks)
      .reduce((agg, check) => [...agg, ...(check || [])], []);
    const nodes = get(this, 'report.nodes') || {};

    return results.map((result) => {
      return {
        ...result,
        nodes: this.getNodes(nodes, result.node_type)
      };
    });
  }),

  resultsForCsv: computed('referencedResults', function() {
    return get(this, 'referencedResults').map((result) => {
      return {
        ...result,
        nodes:     result.nodes.join(','),
        node_type: result.node_type.join(',')
      };
    })
  }),

  summary: computed('state', 'report', function() {
    const state = get(this, 'state');
    const report = get(this, 'report');

    if (state === 'activating' || !report) {
      return {};
    }

    return {
      total:             report.total,
      passed:            report.pass,
      skipped:           report.skip,
      failed:            report.fail
    };
  }),

  createdDate: computed('status.conditions.@each.[status,type]', function() {
    if (!get(this, 'status.conditions')) {
      return '';
    }

    const createdCondition = get(this, 'status.conditions').find(((condition) => condition.type === 'Created'));

    if (!createdCondition) {
      return '';
    }

    return moment(createdCondition.lastUpdateTime).format('dddd MMM D HH:mm:ss');
  }),
  actions:       {
    async download() {
      const file = await get(this, 'csvFile');

      downloadFile(file.name, file.file, 'text/plain');
    },
  },

  getNodes(nodes, nodeTypes) {
    return nodeTypes.reduce((agg, nodeType) => [...agg, ...nodes[nodeType]], []);
  },

  async _loadReport() {
    try {
      const report = await this.followLink('report');

      set(this, 'report', report);

      return report;
    } catch (ex) {
      set(this, 'report', '');

      return '';
    }
  },

  async loadReport() {
    const reportPromise = get(this, 'reportPromise');

    if (reportPromise) {
      return reportPromise;
    }

    const newReportPromise = this._loadReport();

    set(this, 'reportPromise', newReportPromise);

    return newReportPromise;
  },

});
