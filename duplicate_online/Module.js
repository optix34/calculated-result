Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        // ---- 1. Левая панель (вкладка) ----
        var navTab = Ext.create('Ext.panel.Panel', {
            title: 'Дубликат Онлайн',
            iconCls: 'fa fa-copy',
            width: 700,
            layout: 'border',  // используем border для надёжности
            items: [{
                region: 'north',
                height: 40,
                items: [me.buildToolbar()]
            }, {
                region: 'center',
                items: [me.buildTree()]
            }]
        });

        // ---- 2. Правая панель (карта + пусто) ----
        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'vbox',
            items: [{
                xtype: 'panel',
                flex: 1,
                layout: 'fit',
                html: '<div id="dup-online-map" style="width:100%;height:100%;"></div>'
            }, {
                xtype: 'panel',
                flex: 1,
                bodyPadding: 10,
                html: '<div style="text-align:center;">Нижняя панель (пусто)</div>'
            }]
        });

        // ---- 3. Связь и добавление ----
        navTab.map_frame = mainPanel;
        skeleton.navigation.add(navTab);
        // Активируем вкладку принудительно
        if (skeleton.navigation.setActiveTab) {
            skeleton.navigation.setActiveTab(navTab);
        } else if (skeleton.navigation.layout.setActiveItem) {
            skeleton.navigation.layout.setActiveItem(navTab);
        }
        if (skeleton.mapframe) skeleton.mapframe.add(mainPanel);

        // ---- 4. Принудительное обновление макетов и загрузка данных ----
        setTimeout(function() {
            skeleton.navigation.updateLayout();
            if (skeleton.mapframe) skeleton.mapframe.updateLayout();
            navTab.updateLayout();
            // Загружаем дерево
            me.treeStore.load({
                callback: function() {
                    // Разворачиваем корневой узел
                    var root = me.treeStore.getRootNode();
                    if (root) {
                        root.expandChildren(true, false);
                        // Принудительно обновляем представление дерева
                        me.tree.getView().refresh();
                        // Устанавливаем видимую высоту (на случай, если высота нулевая)
                        me.tree.setHeight(navTab.getHeight() - 50);
                    }
                }
            });
        }, 100);

        // Карта
        setTimeout(function() { me.initMap(); }, 200);
    },

    buildToolbar: function() {
        var me = this;
        return Ext.create('Ext.toolbar.Toolbar', {
            items: [{
                text: 'Все', enableToggle: true, toggleGroup: 'statefilter', pressed: true,
                handler: function() { me.filterByState('all'); }
            }, {
                text: 'Активные', enableToggle: true, toggleGroup: 'statefilter',
                handler: function() { me.filterByState(1); }
            }, {
                text: 'Аварии', enableToggle: true, toggleGroup: 'statefilter',
                handler: function() { me.filterByState(2); }
            }, {
                text: 'Стоянка', enableToggle: true, toggleGroup: 'statefilter',
                handler: function() { me.filterByState(3); }
            }, {
                text: 'Холостой ход', enableToggle: true, toggleGroup: 'statefilter',
                handler: function() { me.filterByState(4); }
            }, '->', {
                xtype: 'textfield', emptyText: 'Поиск...', enableKeyEvents: true,
                listeners: { keyup: function(f) { me.applySearchFilter(f.getValue()); } }
            }]
        });
    },

    buildTree: function() {
        var me = this;
        me.treeStore = Ext.create('Ext.data.TreeStore', {
            root: { expanded: true, children: [] },
            proxy: {
                type: 'ajax',
                url: '/ax/tree.php',
                extraParams: { vehs: 1, state: 1 },
                reader: { type: 'json', rootProperty: '' }
            }
        });
        me.tree = Ext.create('Ext.tree.Panel', {
            store: me.treeStore,
            rootVisible: false,
            columns: [{
                xtype: 'treecolumn',
                text: 'Объекты',
                dataIndex: 'text',
                flex: 1
            }],
            // Временно добавим рамку, чтобы убедиться, что дерево присутствует
            style: 'border: 2px solid red;'
        });
        return me.tree;
    },

    filterByState: function(state) {
        var proxy = this.treeStore.getProxy();
        proxy.setExtraParam('state', state === 'all' ? 1 : state);
        this.treeStore.load();
    },

    applySearchFilter: function(query) {
        var root = this.treeStore.getRootNode();
        if (!root) return;
        root.cascadeBy(function(node) { node.set('visible', true); });
        if (!query || query.length < 2) return;
        var lower = query.toLowerCase();
        root.cascadeBy(function(node) { if (node !== root) node.set('visible', false); });
        root.cascadeBy(function(node) {
            if (node !== root) {
                var text = (node.get('text') || '').toLowerCase();
                if (text.indexOf(lower) !== -1) {
                    node.set('visible', true);
                    var p = node.parentNode;
                    while (p && p !== root) { p.set('visible', true); p = p.parentNode; }
                }
            }
        });
    },

    initMap: function() {
        var container = document.getElementById('dup-online-map');
        if (!container) return;
        if (window.MapContainer) {
            this.map = new MapContainer('dup_map');
            this.map.init(55.75, 37.65, 10, 'dup-online-map', false);
        } else if (typeof L !== 'undefined') {
            this.map = L.map('dup-online-map').setView([55.75, 37.65], 10);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
        } else {
            container.innerHTML = '<div style="padding:20px;">Карта не доступна</div>';
        }
    }
});
