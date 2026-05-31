Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        // Левая панель (фирменный стиль)
        var navTab = Ext.create('Ext.panel.Panel', {
            title: l('Дубликат Онлайн'),
            iconCls: 'fa fa-copy',
            width: 700,
            layout: 'vbox',
            border: false,
            cls: 'pilot-leftbar-panel', // для стилизации
            items: [
                me.buildFilterToolbar(),
                me.buildTreePanel()
            ]
        });

        // Правая панель – разделена по горизонтали
        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'vbox',
            border: false,
            items: [{
                xtype: 'panel',
                flex: 1,
                bodyPadding: 10,
                html: '<div style="text-align:center; color:#aaa;">Верхняя панель (пусто)</div>'
            }, {
                xtype: 'panel',
                flex: 1,
                bodyPadding: 10,
                html: '<div style="text-align:center; color:#aaa;">Нижняя панель (пусто)</div>'
            }]
        });

        // Связь и добавление в интерфейс
        navTab.map_frame = mainPanel;
        skeleton.navigation.add(navTab);
        var mapframe = skeleton.mapframe || skeleton.map_frame;
        if (mapframe) mapframe.add(mainPanel);
    },

    // Панель кнопок фильтрации и поиска
    buildFilterToolbar: function() {
        var me = this;
        var toolbar = Ext.create('Ext.toolbar.Toolbar', {
            items: [{
                text: l('Все'),
                stateValue: 'all',
                enableToggle: true,
                toggleGroup: 'statefilter',
                pressed: true,
                handler: function(btn) { me.filterByState(btn, 'all'); }
            }, {
                text: l('Активные'),
                stateValue: 1,
                enableToggle: true,
                toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 1); }
            }, {
                text: l('Аварии'),
                stateValue: 2,
                enableToggle: true,
                toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 2); }
            }, {
                text: l('Стоянка'),
                stateValue: 3,
                enableToggle: true,
                toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 3); }
            }, {
                text: l('Холостой ход'),
                stateValue: 4,
                enableToggle: true,
                toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 4); }
            }, '->', {
                xtype: 'textfield',
                emptyText: l('Поиск...'),
                enableKeyEvents: true,
                listeners: {
                    keyup: function(field) {
                        me.applySearchFilter(field.getValue());
                    }
                }
            }]
        });
        me.searchField = toolbar.items.last();
        return toolbar;
    },

    // Создание панели дерева (с ручным построением данных)
    buildTreePanel: function() {
        var me = this;
        me.treeStore = Ext.create('Ext.data.TreeStore', {
            root: { expanded: true, children: [] }
        });
        me.tree = Ext.create('Ext.tree.Panel', {
            flex: 1,
            store: me.treeStore,
            rootVisible: false,
            useArrows: true,
            lines: true,
            border: true,
            columns: [{
                xtype: 'treecolumn',
                text: l('Объекты'),
                dataIndex: 'text',
                flex: 2
            }, {
                text: l('Статус'),
                dataIndex: 'state',
                width: 110,
                renderer: function(value, meta, record) {
                    if (!record.isLeaf()) return '';
                    switch(value) {
                        case 1: return '<i class="fa fa-play-circle" style="color:green;"></i> ' + l('Активен');
                        case 2: return '<i class="fa fa-exclamation-triangle" style="color:red;"></i> ' + l('Авария');
                        case 3: return '<i class="fa fa-pause-circle" style="color:orange;"></i> ' + l('Стоянка');
                        case 4: return '<i class="fa fa-hourglass-half" style="color:gray;"></i> ' + l('Холостой ход');
                        default: return l('Неизвестно');
                    }
                }
            }, {
                text: l('Обновлено'),
                dataIndex: 'last_update',
                width: 140,
                renderer: function(value) {
                    if (!value) return '—';
                    if (typeof value === 'number') return Ext.Date.format(new Date(value * 1000), 'd.m.Y H:i:s');
                    return value;
                }
            }, {
                text: l('Тип оборудования'),
                dataIndex: 'equip_type',
                width: 120,
                renderer: function(v) { return v || '—'; }
            }, {
                text: l('Скорость'),
                dataIndex: 'speed',
                width: 90,
                renderer: function(v, m, r) {
                    if (!r.isLeaf() || v === undefined) return '—';
                    return v + ' ' + (window.uom ? window.uom.speed : 'км/ч');
                }
            }],
            viewConfig: { stripeRows: true, loadMask: true }
        });
        me.loadTreeData('all');
        return me.tree;
    },

    // Загрузка данных с сервера и построение дерева
    loadTreeData: function(stateValue) {
        var me = this;
        var stateParam = (stateValue === 'all') ? 1 : stateValue;
        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: stateParam },
            success: function(response) {
                var data = Ext.decode(response.responseText);
                var root = me.treeStore.getRootNode();
                root.removeAll();
                // Преобразуем полученный массив в узлы дерева
                me.addNodesToTree(root, data);
                // Раскрываем корневые узлы
                root.expandChildren(true, false);
                // Применяем поиск, если есть текст
                me.applySearchFilter(me.searchField.getValue());
            },
            failure: function() {
                Ext.Msg.alert(l('Ошибка'), l('Не удалось загрузить список объектов'));
            }
        });
    },

    // Рекурсивное добавление узлов из ответа сервера
    addNodesToTree: function(parentNode, children) {
        var me = this;
        Ext.each(children, function(item) {
            // Создаем узел
            var nodeConfig = {
                text: item.text || item.name,
                leaf: !item.children || item.children.length === 0,
                expanded: false,
                // Копируем все поля из ответа, чтобы они были доступны в колонках
                id: item.id,
                state: item.state,
                last_update: item.last_update,
                equip_type: item.equip_type,
                speed: item.speed,
                course: item.course,
                lat: item.lat,
                lon: item.lon,
                address: item.address
            };
            var node = parentNode.appendChild(nodeConfig);
            if (item.children && item.children.length) {
                me.addNodesToTree(node, item.children);
            }
        });
    },

    // Фильтрация по состоянию
    filterByState: function(btn, stateValue) {
        var me = this;
        // Перезагружаем данные с новым параметром state
        me.loadTreeData(stateValue);
        // Визуальное выделение кнопки уже есть благодаря toggleGroup
    },

    // Поиск по тексту (фильтрация узлов дерева)
    applySearchFilter: function(query) {
        var me = this;
        var root = me.treeStore.getRootNode();
        if (!root) return;

        // Сначала показываем все узлы
        root.cascadeBy(function(node) {
            node.set('visible', true);
        });

        if (!query || query.length < 2) return;

        var lowerQuery = query.toLowerCase();
        // Скрываем все узлы
        root.cascadeBy(function(node) {
            if (node !== root) node.set('visible', false);
        });
        // Показываем узлы, соответствующие поиску, и их предков
        root.cascadeBy(function(node) {
            if (node !== root) {
                var text = node.get('text') || '';
                if (text.toLowerCase().indexOf(lowerQuery) !== -1) {
                    node.set('visible', true);
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
