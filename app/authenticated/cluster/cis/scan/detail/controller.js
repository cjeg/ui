import Controller from '@ember/controller';
import { computed, get, set } from '@ember/object';
import { inject as service } from '@ember/service';

const FILE_KEY = 'config.json';

export default Controller.extend({
  modalService: service('modal'),
  router:       service(),
  scope:        service(),

  tableHeaders: [
    {
      name:           'collapse',
      width:          40,
    },
    {
      name:           'state',
      sort:           ['state', 'id'],
      translationKey: 'cis.scan.detail.table.state',
      width:          100,
    },
    {
      name:           'id',
      sort:           ['id'],
      translationKey: 'cis.scan.detail.table.number',
      width:          100,
    },
    {
      name:           'description',
      sort:           ['description', 'id'],
      translationKey: 'cis.scan.detail.table.description',
    },
    {
      name:           'buttons',
      width:          120,
    }
  ],

  runningClusterScans: computed.filterBy('clusterScans', 'isRunning', true),

  disableRunScanButton: computed.notEmpty('runningClusterScans'),

  actions: {
    async runScan() {
      await get(this, 'scope.currentCluster').doAction('runSecurityScan', {
        failuresOnly: false,
        skip:         []
      });
      get(this, 'router').replaceWith('authenticated.cluster.cis/scan');
    },
    download() {
      get(this, 'model.scan').send('download');
    },
    async delete() {
      await get(this, 'modalService').toggleModal('confirm-delete', {
        escToClose:       true,
        resources:        [get(this, 'model.scan')],
        onDeleteFinished: () => get(this, 'router').replaceWith('authenticated.cluster.cis/scan')
      });
    }
  },

  tests: computed('model.scan.report', 'skipList', function() {
    const results = get(this, 'model.scan.report.results');

    if (!results) {
      return [];
    }

    const tests = results.reduce((agg, result) => [...agg, ...result.checks], []);

    return tests.map((test) => {
      const state = this.getCheckState(test);
      const nodeTypes = test.node_type;

      const nodeNames = nodeTypes.reduce((agg, nodeType) => [...agg, ...get(this, `model.scan.report.nodes.${ nodeType }`)], []);
      const uniqueNodeNames = Object.keys(nodeNames.reduce((agg, nodeName) => ({
        ...agg,
        [nodeName]: true
      }), {}));
      const nodes = uniqueNodeNames.map((nodeName) => ({
        state,
        nodeId: get(this, 'model.nodes').findBy('nodeName', nodeName).id,
        name:   nodeName
      }));

      return {
        state,
        id:                test.id,
        description:       test.description,
        remediation:       state === 'Fail' ? test.remediation : null,
        nodes,
        toggleSkip:        () => {
          this.toggleSkip(test.id)
        },
        skipList:          get(this, 'skipList'),
        _availableActions: []
      };
    });
  }),

  securityScanConfig: computed('model.configMaps.@each', function() {
    return get(this, 'model.configMaps').findBy('id', 'security-scan:security-scan-cfg');
  }),

  skipList: computed('securityScanConfig.data.@each', function() {
    try {
      return JSON.parse(get(this, 'securityScanConfig.data')[FILE_KEY]).skip;
    } catch (ex) {
      return [];
    }
  }),

  clusterScans: computed('model.clusterScans.@each', function() {
    return get(this, 'model.clusterScans').filterBy('clusterId', get(this, 'scope.currentCluster.id'));
  }),

  toggleSkip(testId) {
    const isSkipped = get(this, 'skipList').indexOf(testId) !== -1;
    const fn = isSkipped ? this.unskip : this.skip;

    fn.call(this, testId);
  },

  skip(testId) {
    this.editSecurityScanConfig((value) => {
      value.skip.push(testId);

      return value;
    });
  },

  unskip(testId) {
    this.editSecurityScanConfig((value) => {
      value.skip = value.skip.filter((skippedTestId) => skippedTestId !== testId);

      return value;
    });
  },

  editSecurityScanConfig(editorFn) {
    const securityScanConfig = get(this, 'securityScanConfig');
    const configFile = securityScanConfig.data[FILE_KEY];
    const value = JSON.parse(configFile);
    const newValue = editorFn(value);

    set(securityScanConfig, 'data', {
      ...securityScanConfig.data,
      [FILE_KEY]: JSON.stringify(newValue)
    });
    securityScanConfig.save();
  },

  getCheckState(check) {
    switch (check.state) {
    case 'pass':
      return 'Pass';
    case 'skip':
      return 'Skipped';
    default:
      return 'Fail';
    }
  }

});
