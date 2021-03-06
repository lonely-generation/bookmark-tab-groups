'use strict';

const store = {};
const BOOKMARKS_BAR_ID = '1';
const Color = (() => {
    const SkColorSetRGB = (r, g, b) => '#' + [r, g, b].map(x => {
        const hex = x.toString(16)
        return hex.length === 1 ? '0' + hex : hex
      }).join('');
	
	// https://source.chromium.org/chromium/chromium/src/+/main:ui/gfx/color_palette.h?q=SkColorSetRGB
    return {
        blue:   [SkColorSetRGB(0x1A, 0x73, 0xE8), SkColorSetRGB(0x8A, 0xB4, 0xF8)],
        cyan:   [SkColorSetRGB(0x00, 0x7B, 0x83), SkColorSetRGB(0x78, 0xD9, 0xEC)],
        green:  [SkColorSetRGB(0x1E, 0x8E, 0x3E), SkColorSetRGB(0x81, 0xC9, 0x95)],
        grey:   [SkColorSetRGB(0x5F, 0x63, 0x68), SkColorSetRGB(0xBD, 0xC1, 0xC6)],
        pink:   [SkColorSetRGB(0xD0, 0x18, 0x84), SkColorSetRGB(0xFF, 0x8B, 0xCB)],
        purple: [SkColorSetRGB(0x93, 0x34, 0xE6), SkColorSetRGB(0xD7, 0xAE, 0xFB)],
        yellow: [SkColorSetRGB(0xE3, 0x74, 0x00), SkColorSetRGB(0xFD, 0xD6, 0x63)],
        red:    [SkColorSetRGB(0xD9, 0x30, 0x25), SkColorSetRGB(0xF2, 0x8B, 0x82)],
    };
})();


function setupUi() {
    function updateSelected() {
        let tabsAmount = 0;
        let groupsAmount = 0;
        Object.values(store).forEach(wnd => {
            const tabGroupsTabsAmount = Object.values(wnd).filter(tabGroup => tabGroup.selected === true)
                .map(tabGroup => tabGroup.tabs.length);
            groupsAmount += tabGroupsTabsAmount.length;
            tabsAmount += tabGroupsTabsAmount.reduce((a, c) => a + c, 0)
        });
        
        $('#groups-amount').text(groupsAmount);
        $('#tabs-amount').text(tabsAmount);

        if (groupsAmount === 0) {
            $('#folder').addClass('disabled');
        } else {
            $('#folder').removeClass('disabled');
        }
    }

    $('.ui.accordion').accordion({
        exclusive: false
    });
    $('div:not(:last-child) > div > div > .ui.checkbox')
        .checkbox({
        onChange: function () {
            const $t = $(this).parent();                
            const windowName = $t.attr('data-window');
            const tabGroupTitle = $t.attr('data-title');

            store[windowName][tabGroupTitle].selected = $t.checkbox('is checked');

            updateSelected();
        }
    });
    $('div:last-child.item > div > div > .ui.checkbox')
        .checkbox({
            value: false,
            onChange() {
                const ch = $(this);
                ch
                    .closest('.list')
                    .children()
                    .slice(0, -1)
                    .find('.checkbox')
                    .checkbox(
                        ch.parent().checkbox('is checked') ? 'check' : 'uncheck'
                    );

                updateSelected();
            }
        });

    $('#close-selected')
        .checkbox({});
    
    chrome.bookmarks.getSubTree(BOOKMARKS_BAR_ID, ([res]) => {
        const timestamp = new Date().toLocaleString("en-US");
        $('#autogenerated').text(timestamp);
        $('#folder').dropdown({
            allowAdditions: true,
            values: [
                {name: `[Generated]: ${timestamp}`, value: timestamp}, 
                ...res.children
                        .filter(b => b.url === undefined)
                        .map(b => { return {name: b.title, value: b.title} })
            ]
        });
        $('input.search')
            .addClass('ui header')
            .css('top', '-2px');
    });

    $('#form').on('submit', function(event) {
        Promise.resolve(reportStatus('Loading'))
            .then(() => chrome.bookmarks.getSubTree(BOOKMARKS_BAR_ID))
            .then(([tree]) => {
                const groupName = $('#folder').dropdown('get value');
                const exiting = tree.children.filter(c => c.title === groupName)[0];
                if (exiting?.id) {
                    return exiting;
                } else {
                    return chrome.bookmarks.create({ parentId: BOOKMARKS_BAR_ID, title: groupName });
                }
            })
            .then((globalParent) => Promise.all(
                Object.values(store).map(wnd =>
                    Object.entries(wnd)
                        .filter(([_, tabGroup]) => tabGroup.selected === true)
                        .map(([tabGroupName, tabGroup]) => 
                            chrome.bookmarks.create({parentId: globalParent.id, title: tabGroupName})
                                .then((parent) => Promise.all(
                                    tabGroup.tabs.map(t => chrome.bookmarks.create({ 
                                        parentId: parent.id, title: t.title, url: t.url 
                                    }))
                                ))
                    ))
            ))
            .then(() => {
                if ($('#close-selected').checkbox('is checked')) {
                    return chrome.tabs.remove(
                        Object.values(store).map(wnd =>
                            Object.values(wnd)
                                .filter(tabGroup => tabGroup.selected === true)
                                .map(tabGroup => tabGroup.tabs.map(t => t.id)))
                        .flat(2));
                }
            })
            .then(() => 
                reportStatus('Done!', 'check circle')
            );
        event.preventDefault();
    });
    $('#loading').parent().remove();
}


function reportStatus(message, icons) {
    $('.ui.dimmer')
        .addClass('active')
        .find('.content')
        .empty()
        .append(
            $(message.toLowerCase().includes('loading') ?
                '<div class="ui text loader">Loading</div>' :
                `<h4 class="ui inverted icon header"><i class="icon ${icons}"></i>${message}</h4>`
            )
        );
}


const template = {
    Window({ name }) {
        return `
        <div class="title active">
            <i class="dropdown icon"></i>
            ${name}
        </div>
        <div class="content active">
            <div class="transition visible">
            <div class="ui container">
                <div class="ui divided list">
                </div>
            </div>
        </div>`;
    },
    TabGroup({ color, title, tabsLen, windowName }) {
        const rgb = Color[color];
        return `
        <div class="item">
            <div class="ui middle aligned grid">
                <div class="three wide column">
                    <i style="color: ${rgb[0]}" class="big circle middle aligned icon"></i>
                </div>
                <div class="nine wide column">
                    <h4 style="color: ${rgb[1]}" class="ui header">${title}</h4>
                    <div class="description">${tabsLen} Tabs</div>
                </div>
                <div class="four wide column">
                    <div class="ui checkbox" data-tabs-len="${tabsLen}" data-window="${windowName}" data-title="${title}">
                        <input type="checkbox" tabindex="0" class="hidden">
                        <label></label>
                    </div>
                </div>
            </div>
        </div>
        `;
    },
    TabSelectAll() {
        return `
        <div class="item">
            <div class="ui middle aligned grid">
                <div class="three wide column">
                </div>
                <div class="nine wide column">
                    <h4 class="ui header">Select all</h4>
                </div>
                <div class="four wide column">
                    <div class="ui checkbox">
                        <input type="checkbox">
                        <label></label>
                    </div>
                </div>
            </div>
        </div>`;
    }
}


class NoTabGroupsError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
    }
}


class WindowTabGroups {
    static #createTabGroup(windowName, group, tabsLen) {
        return $(template.TabGroup({ 
            tabsLen: tabsLen,
            windowName: windowName,
            ...group
        }));
    }

    static async build(window, windowCounter, tabGroupCounter) {
        const tabs = await chrome.tabs.query({ windowId: window.id });
        if (!tabs.some(t => t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE)) {
            throw new NoTabGroupsError('No groups!');
        }

        const nodeToAppendTo = $('#accordion');

        const windowName = `Window #${windowCounter + 1}${window.type && ` (${window.type})`}`;
        const windowNode = $(template.Window({ 
            name: windowName
        }));
        windowNode.appendTo(nodeToAppendTo);
 
        store[windowName] = {};
        for (const group of await chrome.tabGroups.query({ windowId: window.id })) {
            const tabsSlice = tabs.filter(t => t.groupId === group.id);
            group.title ||= `Unnamed Group ${++tabGroupCounter.i}`;
            store[windowName][group.title] = {
                selected: false,
                tabs: tabsSlice
            };
            windowNode
                .find('.ui.divided.list')
                .append(WindowTabGroups.#createTabGroup(windowName, group, tabsSlice.length));
        }
        windowNode
            .find('.ui.divided.list')
            .append(template.TabSelectAll());
    }
}


async function setupGroups() { 
    const counter = {
        i: 0
    };
    const done = (await Promise.allSettled(
        (await chrome.windows.getAll())
            .map((w, i) => WindowTabGroups.build(w, i, counter))
        ));

    const unexpected = done.filter(p => p.status !== 'fulfilled');
    if (unexpected.length === done.length) {
        if (done.every(p => p.reason instanceof NoTabGroupsError)) {
            throw new NoTabGroupsError('Neither of window contains tab groups.');
        } else {
            unexpected.forEach(e => console.error(e.reason));
            throw new Error('Unexpected error');
        }
    }
}


$(async () => {
    if (chrome.tabGroups === undefined) {
        return reportStatus(
            'No `chrome.tabGroups` support! Chrome 89+ required', 
            'exclamation circle'
        );
    }

    try {
        await setupGroups();
    } catch (error) {
        if (error instanceof NoTabGroupsError) {
            reportStatus('No Tab Groups to Bookmark!', 'folder open outline');
        } else {
            console.error(error);
            reportStatus(
                'Unexpected error! See console for more info', 
                'exclamation triangle'
            );
        }
    } finally {
        setupUi();
    }
});