Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        // Создаём левую панель (вкладка в навигации)
        var navTab = Ext.create('Ext.panel.Panel', {
            title: l('Дубликат Онлайн'),
            iconCls: 'fa fa-copy',
            width: 320,
            layout: 'vbox',
            border: false,
            items: [me.buildFilterToolbar(), me.buildOnlineTree()]
        });

        // Создаём правую панель (разделена по горизонтали)
        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'vbox',
            border: false,
            items: [{
                xtype: 'panel',
                flex: 1,
                bodyPadding: 10,
                html: '<div style="text-align:center; color:#888;">Верхняя панель (пусто)</div>'
            }, {
                xtype: 'panel',
                flex: 1,
                bodyPadding: 10,
                html: '<div style="text-align:center; color:#888;">Нижняя панель (пусто)</div>'
            }]
        });

        // Связываем
        navTab.map_frame = mainPanel;

        // Добавляем в левую навигацию
        if (skeleton && skeleton.navigation) {
            skeleton.navigation.add(navTab);
        } else {
            Ext.log.error('skeleton.navigation not found');
            return;
        }

        // Добавляем основную панель в mapframe (или map_frame)
        var mapframe = skeleton.mapframe || skeleton.map_frame;
        if (mapframe && mapframe.add) {
            mapframe.add(mainPanel);
        } else {
            Ext.log.error('skeleton.mapframe/map_frame not found');
        }
    },

    // Панель кнопок фильтрации
    buildFilterToolbar: function() {
        var me = this;
        return Ext.create('Ext.toolbar.Toolbar', {
            items: [
                { text: l('Все'),     handler: function() { me.filterTreeByState('all'); } },
                { text: l('Активные'),handler: function() { me.filterTreeByState(1); } },
                { text: l('Аварии'),  handler: function() { me.filterTreeByState(2); } },
                { text: l('Стоянка'), handler: function() { me.filterTreeByState(3); } },
                { text: l('Холостой'),handler: function() { me.filterTreeByState(4); } },
                '->',
                {
                    xtype: 'textfield',
                    emptyText: l('Поиск...'),
                    enableKeyEvents: true,
                    listeners: {
                        keyup: function(field) {
                            me.applySearchFilter(field.getValue());
                        }
                    }
                }
            ]
        });
    },

    // Дерево объектов
    buildOnlineTree: function() {
        var me = this;
        me.treeStore = Ext.create('Ext.data.TreeStore', {
            root: {
                expanded: true,
                children: []
            },
            proxy: {
                type: 'ajax',
                url: '/ax/tree.php',
                extraParams: {
                    vehs: 1,
                    state: 1   // по умолчанию "все"
                },
                reader: {
                    type: 'json',
                    rootProperty: ''   // данные приходят как массив
                }
            },
            listeners: {
                load: function(store, node, records) {
                    me.originalRoot = store.getRootNode().copy(); // сохраняем копию для фильтрации
                    me.filterTreeByState(me.currentState || 'all');
                    me.applySearchFilter(me.searchQuery);
                }
            }
        });

        me.tree = Ext.create('Ext.tree.Panel', {
            flex: 1,
            store: me.treeStore,
            rootVisible: false,
            useArrows: true,
            lines: true,
            border: false
        });

        return me.tree;
    },

    // Фильтрация по состоянию (state)
    currentState: 'all',
    filterTreeByState: function(stateValue) {
        this.currentState = stateValue;
        if (!this.treeStore) return;

        var store = this.treeStore;
        var root = store.getRootNode();

        if (!this.originalRoot) {
            // Если ещё нет копии, перезагрузим с новым параметром
            store.getProxy().setExtraParam('state', stateValue === 'all' ? 1 : stateValue);
            store.load();
            return;
        }

        // Восстанавливаем из копии
        root.removeAll();
        var copyRoot = this.originalRoot.copy();
        Ext.each(copyRoot.childNodes, function(child) {
            root.appendChild(child.copy());
        });

        // Рекурсивно удаляем узлы, у которых state не соответствует
        var me = this;
        function filterNode(node) {
            var keep = false;
            if (node.get('leaf')) {
                // Транспортное средство
                var st = node.get('state');
                if (stateValue === 'all') keep = true;
                else if (stateValue === 1 && st === 1) keep = true;
                else if (stateValue === 2 && st === 2) keep = true;
                else if (stateValue === 3 && st === 3) keep = true;
                else if (stateValue === 4 && st === 4) keep = true;
            } else {
                // Группа – проверяем детей
                var childKeep = false;
                node.childNodes.forEach(function(child) {
                    if (filterNode(child)) childKeep = true;
                });
                keep = childKeep;
            }
            node.set('visible', keep);
            if (!keep) {
                node.remove();
            }
            return keep;
        }

        root.childNodes.forEach(function(child) {
            filterNode(child);
        });

        // Применить поиск
        this.applySearchFilter(this.searchQuery);
    },

    // Поиск по тексту
    searchQuery: '',
    applySearchFilter: function(query) {
        this.searchQuery = query;
        if (!this.treeStore) return;

        var store = this.treeStore;
        var root = store.getRootNode();

        if (!query || query.length < 2) {
            // Показываем все узлы, которые visible (уже отфильтрованы по состоянию)
            root.cascadeBy(function(node) {
                if (node.get('visible') !== false) {
                    node.set('visible', true);
                }
            });
            return;
        }

        var lowerQuery = query.toLowerCase();
        // Сначала скрываем все узлы, кроме корня
        root.cascadeBy(function(node) {
            if (node !== root) node.set('visible', false);
        });

        // Показываем узлы, у которых текст содержит подстроку
        root.cascadeBy(function(node) {
            if (node !== root) {
                var text = node.get('text') || node.get('name') || '';
                if (text.toLowerCase().indexOf(lowerQuery) !== -1) {
                    node.set('visible', true);
                    // Показать всех предков
                    var parent = node.parentNode;
                    while (parent && parent !== root) {
                        parent.set('visible', true);
                        parent = parent.parentNode;
                    }
                }
            }
        });
    }
});
