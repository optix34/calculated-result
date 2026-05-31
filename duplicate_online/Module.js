Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        // Загружаем CSS
        var cssUrl = me.getModuleBaseUrl() + 'style.css';
        Ext.util.CSS.swapStyleSheet('duplicate_online_css', cssUrl);

        // Левая панель
        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: l('Дубликат Онлайн'),
            iconCls: 'fa fa-copy',
            iconAlign: 'top',
            minimized: true,
            width: 300,
            items: [{
                xtype: 'container',
                layout: 'vbox',
                flex: 1,
                items: me.buildOnlineTreePanel()
            }]
        });

        // Правая панель
        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'vbox',
            items: [{
                xtype: 'panel',
                flex: 1,
                bodyStyle: 'background: #f5f5f5;',
                html: '<div style="padding:20px; text-align:center;">Верхняя панель (пусто)</div>'
            }, {
                xtype: 'panel',
                flex: 1,
                bodyStyle: 'background: #e0e0e0;',
                html: '<div style="padding:20px; text-align:center;">Нижняя панель (пусто)</div>'
            }]
        });

        navTab.map_frame = mainPanel;
        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);
    },

    getModuleBaseUrl: function() {
        var scripts = document.getElementsByTagName('script');
        for (var i = 0; i < scripts.length; i++) {
            var src = scripts[i].src || '';
            if (src.indexOf('/Module.js') !== -1) {
                return src.replace('Module.js', '');
            }
        }
        return './';
    },

    buildOnlineTreePanel: function() {
        var me = this;

        var treeStore = Ext.create('Ext.data.TreeStore', {
            root: { expanded: true, children: [] },
            proxy: {
                type: 'ajax',
                url: '/ax/tree.php',
                extraParams: { vehs: 1, state: 1 },
                reader: { type: 'json', rootProperty: 'data' }
            },
            listeners: {
                load: function(store) {
                    me.applySearchFilter(store, me.searchField && me.searchField.getValue());
                }
            }
        });

        var tree = Ext.create('Ext.tree.Panel', {
            flex: 1,
            store: treeStore,
            rootVisible: false,
            useArrows: true,
            lines: true
        });

        var filterBar = Ext.create('Ext.toolbar.Toolbar', {
            items: [
                { text: l('Все'), stateValue: 'all', handler: function() { me.filterByState(tree, 'all'); } },
                { text: l('Активные'), stateValue: 1, handler: function() { me.filterByState(tree, 1); } },
                { text: l('Аварии'), stateValue: 2, handler: function() { me.filterByState(tree, 2); } },
                { text: l('Стоянка'), stateValue: 3, handler: function() { me.filterByState(tree, 3); } },
                { text: l('Холостой ход'), stateValue: 4, handler: function() { me.filterByState(tree, 4); } },
                '->',
                {
                    xtype: 'textfield',
                    emptyText: l('Поиск...'),
                    enableKeyEvents: true,
                    listeners: {
                        keyup: function(field) {
                            me.applySearchFilter(tree.getStore(), field.getValue());
                        }
                    }
                }
            ]
        });

        me.searchField = filterBar.items.last();

        return {
            xtype: 'container',
            layout: 'vbox',
            items: [filterBar, tree]
        };
    },

    filterByState: function(tree, stateValue) {
        var store = tree.getStore();
        var proxy = store.getProxy();

        if (stateValue === 'all') {
            proxy.setExtraParam('state', 1);
        } else {
            proxy.setExtraParam('state', stateValue);
        }

        store.load({
            callback: function() {
                this.applySearchFilter(store, this.searchField && this.searchField.getValue());
            },
            scope: this
        });
    },

    applySearchFilter: function(store, query) {
        if (!store) return;
        if (!query || query.length < 2) {
            store.clearFilter();
            store.getRootNode().cascadeBy(function(node) {
                node.set('visible', true);
            });
            return;
        }

        var lowerQuery = query.toLowerCase();
        store.getRootNode().cascadeBy(function(node) {
            var text = node.get('text') || node.get('name') || '';
            var visible = text.toLowerCase().indexOf(lowerQuery) !== -1;
            node.set('visible', visible);
            if (visible) {
                var parent = node.parentNode;
                while (parent && parent !== store.getRootNode()) {
                    parent.set('visible', true);
                    parent = parent.parentNode;
                }
            }
        });
    }
});
