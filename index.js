import { setupDevtoolsPlugin } from '@vue/devtools-api'

const LABEL_VUEX_BINDINGS = 'vuex bindings'
const MUTATIONS_LAYER_ID = 'vuex:mutations'
const ACTIONS_LAYER_ID = 'vuex:actions'
const INSPECTOR_ID = 'vuex'

let actionId = 0

export function addDevtools(app, store) {
  setupDevtoolsPlugin(
    {
      id: 'org.vuejs.vuex',
      app,
      label: 'Vuex',
      homepage: 'https://next.vuex.vuejs.org/',
      logo: 'https://vuejs.org/images/icons/favicon-96x96.png',
      packageName: 'vuex',
      componentStateTypes: [LABEL_VUEX_BINDINGS]
    },
    (api) => {
      api.addTimelineLayer({
        id: MUTATIONS_LAYER_ID,
        label: 'Vuex Mutations',
        color: COLOR_LIME_500
      })

      // First of timeline event is broken. Idk its my fault or something.
      // Without this first event data not showing.
      api.addTimelineEvent({
        layerId: 'test',
        event: {
          time: 1,
          data: undefined
        }
      })

      api.addTimelineLayer({
        id: ACTIONS_LAYER_ID,
        label: 'Vuex Actions',
        color: COLOR_LIME_500
      })

      api.addInspector({
        id: INSPECTOR_ID,
        label: 'Vuex',
        icon: 'storage',
        treeFilterPlaceholder: 'Filter stores...'
      })

      api.on.getInspectorTree((payload) => {
        if (payload.app === app && payload.inspectorId === INSPECTOR_ID) {
          if (payload.filter) {
            const nodes = []
            flattenStoreForInspectorTree(nodes, store._modules.root, payload.filter, '')
            payload.rootNodes = nodes
          } else {
            payload.rootNodes = [
              formatStoreForInspectorTree(store._modules.root, '')
            ]
          }
        }
      })

      api.on.getInspectorState((payload) => {
        if (payload.app === app && payload.inspectorId === INSPECTOR_ID) {
          const modulePath = payload.nodeId
          makeLocalGetters(store, modulePath)
          payload.state = formatStoreForInspectorState(
            getStoreModule(store._modules, modulePath),
            store._makeLocalGettersCache,
            modulePath
          )
        }
      })

      api.on.editInspectorState((payload) => {
        if (payload.app === app && payload.inspectorId === INSPECTOR_ID) {
          const modulePath = payload.nodeId
          let path = payload.path
          if (modulePath !== 'root') {
            path = [...modulePath.split('/').filter(Boolean), ...path]
          }
          store._withCommit(() => {
            payload.set(store._state.data, path, payload.state.value)
          })
        }
      })

      store.subscribe((mutation, state) => {
        const data = {}

        if (mutation.payload) {
          data.payload = mutation.payload
        }

        data.state = JSON.parse(JSON.stringify(state))

        api.notifyComponentUpdate()
        api.sendInspectorTree(INSPECTOR_ID)
        api.sendInspectorState(INSPECTOR_ID)

        api.addTimelineEvent({
          layerId: MUTATIONS_LAYER_ID,
          event: {
            time: Date.now(),
            title: mutation.type,
            data
          }
        })
      })

      store.subscribeAction({
        before: (action, state) => {
          const data = {}
          if (action.payload) {
            data.payload = action.payload
          }
          action._id = actionId++
          action._time = Date.now()
          data.state = JSON.parse(JSON.stringify(state))

          api.addTimelineEvent({
            layerId: ACTIONS_LAYER_ID,
            event: {
              time: action._time,
              title: action.type,
              groupId: action._id,
              subtitle: 'start',
              data
            }
          })
        },
        after: (action, state) => {
          const data = {}
          const duration = Date.now() - action._time
          data.duration = {
            _custom: {
              type: 'duration',
              display: `${duration}ms`,
              tooltip: 'Action duration',
              value: duration
            }
          }
          if (action.payload) {
            data.payload = action.payload
          }
          data.state = JSON.parse(JSON.stringify(state))

          api.addTimelineEvent({
            layerId: ACTIONS_LAYER_ID,
            event: {
              time: Date.now(),
              title: action.type,
              groupId: action._id,
              subtitle: 'end',
              data
            }
          })
        }
      })
    }
  )
}

export function makeLocalGetters(store, namespace) {
  if (!store._makeLocalGettersCache[namespace]) {
    const gettersProxy = {}
    const splitPos = namespace !== 'root' ? namespace.length : 0

    Object.keys(namespace !== 'root' ? store.getters : store._modules.root._rawModule.getters).forEach(type => {

      console.log(type)
      // skip if the target getter is not match this namespace
      if (namespace !== 'root')
        if (type.slice(0, splitPos) !== namespace) return

      // extract local getter type
      const localType = type.slice(splitPos)

      // Add a port to the getters proxy.
      // Define as getter property because
      // we do not want to evaluate the getters in this time.
      Object.defineProperty(gettersProxy, localType, {
        get: () => store.getters[type],
        enumerable: true
      })
    })
    console.log(store)
    store._makeLocalGettersCache[namespace] = gettersProxy
  }

  return store._makeLocalGettersCache[namespace]
}

const COLOR_LIME_500 = 0x84cc16
const COLOR_DARK = 0x666666
const COLOR_WHITE = 0xffffff

const TAG_NAMESPACED = {
  label: 'namespaced',
  textColor: COLOR_WHITE,
  backgroundColor: COLOR_DARK
}

function extractNameFromPath(path) {
  return path && path !== 'root' ? path.split('/').slice(-2, -1)[0] : 'Root'
}

function formatStoreForInspectorTree(module, path) {
  return {
    id: path || 'root',

    label: extractNameFromPath(path),
    tags: module.namespaced ? [TAG_NAMESPACED] : [],
    children: Object.keys(module._children).map((moduleName) =>
      formatStoreForInspectorTree(
        module._children[moduleName],
        path + moduleName + '/'
      )
    )
  }
}

function flattenStoreForInspectorTree(result, module, filter, path) {
  if (path.includes(filter)) {
    result.push({
      id: path || 'root',
      label: path.endsWith('/') ? path.slice(0, path.length - 1) : path || 'Root',
      tags: module.namespaced ? [TAG_NAMESPACED] : []
    })
  }
  Object.keys(module._children).forEach(moduleName => {
    flattenStoreForInspectorTree(result, module._children[moduleName], filter, path + moduleName + '/')
  })
}

function formatStoreForInspectorState(module, getters, path) {
  getters = path === 'root' ? getters : getters[path]
  const gettersKeys = Object.keys(getters)
  const storeState = {
    state: Object.keys(module.state).map((key) => ({
      key,
      editable: true,
      value: module.state[key]
    }))
  }

  if (gettersKeys.length) {
    storeState.getters = gettersKeys.map((key) => ({
      key: key.endsWith('/') ? extractNameFromPath(key) : key,
      editable: false,
      value: getters[key]
    }))
  }

  return storeState
}

function getStoreModule(moduleMap, path) {
  const names = path.split('/').filter((n) => n)
  return names.reduce(
    (module, moduleName, i) => {
      const child = module[moduleName]
      if (!child) {
        throw new Error(`Missing module "${moduleName}" for path "${path}".`)
      }
      return i === names.length - 1 ? child : child._children
    },
    path === 'root' ? moduleMap : moduleMap.root._children
  )
}
