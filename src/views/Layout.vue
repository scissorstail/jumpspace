<template>
  <div id="layout">
    <b-overlay
      :show="isShowInfoPopup"
      no-wrap
      rounded="sm"
      opacity="0.6"
      variant="dark"
      blur="3px"
      z-index="1050"
    >
      <template v-slot:overlay>
        <b-card-group deck>
          <b-card bg-variant="light" :header="`testnet v${appVersion}`" class="text-center">
            <b-card-body>
              <b-card-text class="mb-3">
                <b-row class="mb-3">
                  <b-col>
                    <b-img
                      fluid
                      rounded
                      src="/img/icons/256px-Electron_Software_Framework_Logo.svg.png"
                      alt="Image 1"
                      width="150"
                      :block="false"
                    ></b-img>
                    <b-img
                      fluid
                      rounded
                      src="/img/icons/msapplication-icon-144x144.png"
                      alt="Image 1"
                      width="150"
                    ></b-img>
                  </b-col>
                </b-row>
                <b-row>
                  <b-col>
                    <b>테스트 버전</b>
                  </b-col>
                </b-row>
              </b-card-text>

              <b-card-text>
                <div>
                  Icons made by
                  <a
                    href="https://www.flaticon.com/authors/pixel-perfect"
                    title="Pixel perfect"
                    target="_blank"
                  >Pixel perfect</a> from
                  <a
                    href="https://www.flaticon.com/"
                    title="Flaticon"
                    target="_blank"
                  >www.flaticon.com</a>
                </div>
              </b-card-text>

              <b-card-text>
                <div>
                  Font Awesome Free 5.14.0 by @fontawesome -
                  <a
                    href="https://fontawesome.com"
                    title="fontawesome"
                    target="_blank"
                  >https://fontawesome.com</a>
                </div>
              </b-card-text>
            </b-card-body>

            <template v-slot:footer>
              <b-button
                block
                variant="light"
                @click="isShowInfoPopup = false"
                class="shadow-sm flex-grow-1 mr-1"
              >
                <v-icon name="times" height="14" width="14" scale="1" />
              </b-button>
            </template>
          </b-card>
        </b-card-group>
      </template>
    </b-overlay>

    <MainHeader
      :header-info="headerInfo"
      @save="saveProject"
      @export="exportProject"
      @info="isShowInfoPopup = true"
    >
      <!-- sidebar-navigator toggle button -->
      <template #main-navigation-toggle>
        <b-button class="header-button shadow-sm" v-b-toggle.main-sidebar variant="info">
          <v-icon name="bars" height="14" width="14" scale="1" />
        </b-button>
      </template>
    </MainHeader>
    <div id="main-content">
      <!-- sidebar-navigator -->
      <b-sidebar id="main-sidebar" body-class="main-sidebar-list" shadow no-header>
        <template v-slot:default="{ hide }">
          <div class="main-sidebar-header p-3 shadow">
            <b-button variant="light" @click="hide" class="shadow-sm flex-grow-1 mr-1">
              <v-icon name="times" height="14" width="14" scale="1" />
            </b-button>
            <b-button class="mr-1" variant="outline-info" @click="importProject">
              <v-icon name="file-export" height="14" width="14" scale="1" />
            </b-button>
            <b-button
              :variant="isEditingItemList ? 'warning' : 'light'"
              @click="toggleEdit"
              class="shadow-sm flex-grow-9"
            >
              <v-icon
                :name="isEditingItemList ? 'save' : 'edit'"
                height="14"
                width="14"
                scale="1"
                style="width: 16px;"
              />
            </b-button>
          </div>

          <MainNavigator
            ref="mainNavigator"
            :project-data="projectData"
            :is-editing="isEditingItemList"
            @selected="loadItem"
          ></MainNavigator>
        </template>
      </b-sidebar>

      <Editor v-show="editorData" ref="editorRef" :editor-data="editorData"></Editor>
    </div>
    <!--
    <MainFooter id="main-footer"></MainFooter>
    -->
  </div>
</template>

<script>
import MainHeader from '../components/layout/main-header'
import MainNavigator from '../components/layout/main-navigator'
// import MainFooter from '../components/layout/main-footer'
import Editor from '../components/Editor/index'

export default {
  name: 'Layout',
  components: {
    MainHeader,
    MainNavigator,
    Editor
    // MainFooter,
  },
  data () {
    return {
      isEditingItemList: false,
      isShowInfoPopup: false,
      projectData: null,
      editorData: null,
      selectedIndex: null,
      headerInfo: {
        name: null
      }
    }
  },
  mounted () {
    const localSave = window.localStorage.projectSaveData
    if (localSave) {
      this.loadProject(localSave)
    }
  },
  methods: {
    loadItem ({ item, index }) {
      this.editorData = JSON.stringify(item.data)
      this.selectedIndex = index
      this.headerInfo.name = item.name
    },
    async toggleEdit () {
      if (this.isEditingItemList) {
        this.projectData = [...this.$refs.mainNavigator.items]
        this.saveProject()
      } else {
        this.clearEditor()
      }
      this.isEditingItemList = !this.isEditingItemList
    },
    async loadProject (projectSaveData) {
      if (projectSaveData) {
        this.projectData = JSON.parse(projectSaveData)
      } else {
        this.projectData = []
      }
    },
    async saveProject () {
      if (this.selectedIndex !== null) {
        this.$refs.editorRef.editor.nodes.forEach(x => x.controls.get('connection').save())
        this.projectData[this.selectedIndex] = {
          name: this.headerInfo.name,
          data: await this.$refs.editorRef.compile()
        }
      }
      window.localStorage.projectSaveData = JSON.stringify(this.projectData)
    },
    async exportProject () {
      await this.saveProject()
      window.saveProjectDataAsJSON(window.localStorage.projectSaveData)
    },
    async importProject () {
      const projectData = window.loadProjectDataFromJSON()
      if (projectData) {
        this.clearEditor()
        this.loadProject(projectData)
      }
    },
    clearEditor () {
      this.editorData = null
      this.selectedIndex = null
      this.headerInfo.name = null
    }
  }
}
</script>

<style lang="scss">
@import '../../node_modules/bootstrap/dist/css/bootstrap.css';
@import '../../node_modules/bootstrap-vue/dist/bootstrap-vue.css';

#layout {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  margin: 0;
}
#main-content {
  display: flex;
  flex-direction: row;
  flex: 1;
  overflow: hidden;
  background-color: #f1faee;

  #main-sidebar {
    opacity: 0.9;

    .main-sidebar-list {
      display: flex;
      flex-direction: column;
    }

    .main-sidebar-header {
      display: flex;
      flex-direction: row;
      background-color: #1d3557f0;
    }
  }
}
#main-footer {
  display: flex;
  min-height: 100px;
  background-color: green;
}
</style>
