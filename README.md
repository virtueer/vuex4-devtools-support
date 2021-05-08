# vuex4-devtools-support

All of logic stealed from [Akryum's Pull Request](https://github.com/vuejs/vuex/pull/1949/). I just played on it a little bit.

### Usage
```javascript
const app = createApp(App)
app.use(store)
app.mount('#app')

import { addDevtools } from "./index";
addDevtools(app, store)
```
