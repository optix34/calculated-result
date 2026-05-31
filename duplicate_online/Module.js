Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        let me = this;
        console.log('[duplicate_online] initModule started');

        // Левая панель
        let navTab = Ext.create('Ext.panel.Panel', {
            title: 'Дубликат Онлайн',
            iconCls: 'fa fa-copy',
            width: 750,
            layout: 'vbox',
            items: [me.buildToolbar(), me.buildTree()]
        });

        // Правая панель
        let mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'vbox',
            items: [{
                xtype: 'panel',
                flex: 1,
                layout: 'fit',
                html: '<div id="duplicate-online-map" style="width:100%;height:100%;"></div>'
            }, {
                xtype: 'panel',
                flex: 1,
                html: '<div style="text-align:center; padding:20px;">Нижняя панель (пусто)</div>'
            }]
        });

        mainPanel.on('afterrender', function() {
            me.initMap();
        }, me, { single: true });

        navTab.map_frame = mainPanel;

        // Добавляем вкладку в левую навигацию
        skeleton.navigation.add(navTab);
        console.log('[duplicate_online] Панель добавлена в navigation');

        // ПРИНУДИТЕЛЬНО АКТИВИРУЕМ ВКЛАДКУ
        skeleton.navigation.setActiveTab(navTab);

        let mapframe = skeleton.mapframe || skeleton.map_frame;
        if (mapframe) {
            mapframe.add(mainPanel);
            console.log('[duplicate_online] Панель добавлена в mapframe');
        }

        // Принудительно загружаем данные дерева и раскрываем корень
        me.treeStore.on('load', function() {
            console.log('[duplicate_online] Дерево загружено, узлов:', me.treeStore.getRootNode().childNodes.length);
            me.treeStore.getRootNode().expandChildren(true, false);
        });
        me.treeStore.load();
    },

    buildToolbar: function() {
        let me = this;
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
        let me = this;
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
            flex: 1,
            store: me.treeStore,
            rootVisible: false,
            useArrows: true,
            columns: [{
                xtype: 'treecolumn', text: 'Объекты', dataIndex: 'text', flex: 1
            }, {
                text: 'Статус', dataIndex: 'state', width: 100,
                renderer: function(v, m, rec) {
                    if (!rec.isLeaf()) return '';
                    switch(v) {
                        case 1: return '<span style="color:green;">● Активен</span>';
                        case 2: return '<span style="color:red;">⚠ Авария</span>';
                        case 3: return '<span style="color:orange;">⏸ Стоянка</span>';
                        case 4: return '<span style="color:gray;">⏳ Холостой ход</span>';
                        default: return '—';
                    }
                }
            }]
        });
        return me.tree;
    },

    filterByState: function(state) {
        let proxy = this.treeStore.getProxy();
        proxy.setExtraParam('state', state === 'all' ? 1 : state);
        this.treeStore.load();
    },

    applySearchFilter: function(query) {
        let root = this.treeStore.getRootNode();
        if (!root) return;
        root.cascadeBy(node => node.set('visible', true));
        if (!query || query.length < 2) return;
        let lower = query.toLowerCase();
        root.cascadeBy(node => { if (node !== root) node.set('visible', false); });
        root.cascadeBy(node => {
            if (node !== root) {
                let text = (node.get('text') || '').toLowerCase();
                if (text.indexOf(lower) !== -1) {
                    node.set('visible', true);
                    let p = node.parentNode;
                    while (p && p !== root) { p.set('visible', true); p = p.parentNode; }
                }
            }
        });
    },

    initMap: function() {
        let container = document.getElementById('duplicate-online-map');
        if (!container) return;
        if (window.MapContainer) {
            this.map = new MapContainer('dup_map');
            this.map.init(55.75, 37.65, 10, 'duplicate-online-map', false);
            console.log('[duplicate_online] Карта создана');
        } else if (typeof L !== 'undefined') {
            this.map = L.map('duplicate-online-map').setView([55.75, 37.65], 10);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
        } else {
            container.innerHTML = '<div style="padding:20px;">Карта не доступна</div>';
        }
    }
});
