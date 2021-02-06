(() => {

    // Script approved as of t13258370 (JawJaw)
    // Script by tcamps (Tyler) and Shinko to Kuma (Sophie)

    /**
     * Initialization
     */

    // Override these settings by defining `window.playerFarmSettings`
    var settings = $.extend({
        // When calculating how many resources are available for farming
        // from a villa, determines whether to consider existing commands
        // that will land after the LT from the current village
        //
        // ('true' prevents wasted runs, 'false' allows closer villages
        //  to get more resources.)
        prioritizeExistingCommands: true,

        // Whether or not to always include 1 scout in each attack, if
        // available
        addScout: true,

        // Method for determining how many troops to send:
        // - 'total': just enough to loot all res
        // - 'diff': just enough to loot the res generated between the last and current runs
        method: 'total',

        methodOptions: {
            total: {
                // Limit how the age of the latest report affects resource
                // estimates
                maxHourlyProjection: 12
            },

            diff: {
                // The target send interval, will cause villas sent earlier
                // to be prioritized over villas sent to recently
                sendIntervalMinutes: 30
            }
        },

        // Allowed troop compositions to use when farming; each array
        // is a different composition. By default can either send at
        // least 5 lc, or at least 25 spears *and* 10 swords.
        //
        // Ordered by priority
        allowedTroops: [
            [
                { name: 'light', min: 5, max: 75 }
            ],
            [
                { name: 'spear', min: 25, max: 75 },
                { name: 'sword', min: 10, max: 10 }
            ]
        ],

        cookieName: 'pf-history'
    }, window.playerFarmSettings || {});

    console.log('Using settings: ', settings);

    if (!window.playerVillageCoords) {
        alert('Assign playerVillageCoords to use the script');
        return;
    }

    function parseCoord(coord) {
        coord = coord.trim();
        let split = coord.split('|');
        return {
            x: parseInt(split[0]),
            y: parseInt(split[1]),
            value: coord
        };
    }

    var targetCoords = window.playerVillageCoords.trim();
    if (typeof targetCoords == 'string') {
        targetCoords = targetCoords
            .split(/[,\s]/)
            .map(parseCoord);
    }

    // targetCoords is array of:
    // [ { x: 500, y: 500, value: '500|500' }, ... ]

    console.log('Got target coords: ', targetCoords);

    // remove data for villages that are no longer targeted
    updateSavedData(getSavedData().filter(village => {
        var matchingCoord = targetCoords.filter(c => c.value == village.coords);
        return matchingCoord.length > 0;
    }));


    $.getAll = function (
        urls, // array of URLs
        onLoad, // called when any URL is loaded, params (index, data)
        onDone, // called when all URLs successfully loaded, no params
        onError // called when a URL load fails or if onLoad throws an exception, params (error)
    ) {
        var numDone = 0;
        var lastRequestTime = 0;
        var minWaitTime = 200; // ms between requests
        loadNext();
        function loadNext() {
            if (numDone == urls.length) {
                onDone();
                return;
            }

            let now = Date.now();
            let timeElapsed = now - lastRequestTime;
            if (timeElapsed < minWaitTime) {
                let timeRemaining = minWaitTime - timeElapsed;
                setTimeout(loadNext, timeRemaining);
                return;
            }

            console.log('Getting ', urls[numDone]);
            lastRequestTime = now;
            $.get(urls[numDone])
                .done((data) => {
                    try {
                        onLoad(numDone, data);
                        ++numDone;
                        loadNext();
                    } catch (e) {
                        onError(e);
                    }
                })
                .fail((xhr) => {
                    onError(xhr);
                })
        }
    };

    function getSavedData() {
        let result = JSON.parse(localStorage.getItem('pf-data') || '[]');
        // Dates get stored as strings, parse them back to their original Date objects
        result.forEach((village) => {
            village.reports.forEach((report) => {
                if (report.occurredAt)
                    report.occurredAt = new Date(report.occurredAt);
            });

            village.currentCommands.forEach((cmd) => {
                if (cmd.landsAt)
                    cmd.landsAt = new Date(cmd.landsAt);
            });
        });
        return result;
    }

    function updateSavedData(villageData) {
        localStorage.setItem('pf-data', JSON.stringify(villageData));
    }

    function clearSavedData() {
        localStorage.removeItem('pf-data');
    }

    function makeProgressLabel(action, numDone, numTotal) {
        return `${action} (${numDone}/${numTotal} done)`;
    }

    /**
     * Common/shared data
     */

    // Contains functions so that we can modify the results without changing the global values
    let Data = {
        travelSpeeds: () => ({
            spear: 18, sword: 22, axe: 18, archer: 18, spy: 9,
            light: 10, marcher: 10, heavy: 11, ram: 30, catapult: 30,
            paladin: 10
        }),

        unitHauls: () => ({
            spear: 25, sword: 15, axe: 10,
            archer: 10, spy: 0, light: 80,
            marcher: 50, heavy: 50, ram: 0,
            catapult: 0, knight: 100, snob: 0
        })
    };

    let LastSelectedVillage = null;

    /**
     * App start
     */

    if (trackCommand())
        return;

    if (redirectToRallyPoint())
        return;

    // TODO - should show data download/management UI if no data is stored yet
    addManagementInterfaceLink();
    fillRallyPoint(false, () => {
        console.log('Filled rally point')
    }, (err) => {
        console.error(err);
        alert('An error occurred');
    });

    //updateTargetVillageData(console.log, console.error, console.log);



    /**
     * Management UI
     */
    function redirectToRallyPoint() {
        function contains(str, substr) {
            return str.indexOf(substr) >= 0;
        }
        let href = window.location.href;
        let isRallyPoint = contains(href, 'screen=place') && (contains(href, 'mode=command') || !contains(href, 'mode='));
        if (isRallyPoint) {
            return false;
        } else {
            if (confirm('Redirecting to rally point.')) {
                let targetUrl = `/game.php?village=${game_data.village.id}&screen=place&mode=command`
                window.location.href = targetUrl;
            }
            return true;
        }
    }

    function trackCommand() {
        function contains(str, substr) {
            return str.indexOf(substr) >= 0;
        }
        let href = window.location.href;
        let isSendCmd = contains(href, 'screen=place') && contains(href, 'try=confirm');

        if (isSendCmd)
        storePendingCommand();
        return isSendCmd;
    }

    function displayManagementUI() {
        // TODO
        // Should make a popup using TW's Dialog.show(...)

        var html = `
            <div id="buttonRow" style="width:500px">
                <p>
                    ${makeTwButton('pf-refresh-data', 'Refresh Village Data')}
                    ${makeTwButton('pf-display-data', 'Show Village Data')}
                </p>
                <p id="pf-update-progress">
                </p>
            </div>
            <div id="details" style="height:0px;overflow-y: auto">
            <table id="detailsVillages" class="vis">
            </table>
            </div>
        `;


        function onDialogClosed() {
            console.log('closed');
        }

        Dialog.show('player-farm', html.trim(), onDialogClosed, {});

        //$('#pf-display-data').hide();
        $('#popup_box_player-farm').width("700px");

        $('#pf-display-data').click(() => {
            $('#details').height("500px");
            displayTargetInfo(targetCoords);
        });

        var $updateProgressContainer = $('#pf-update-progress');

        function onUpdateProgress(msg) {
            $updateProgressContainer.text(msg);
        }

        function onUpdateError(err) {
            $updateProgressContainer.text(err);
        }

        $('#pf-refresh-data').click(() => {
            updateTargetVillageData((result) => {
                updateSavedData(result);
                console.log('Stored result data: ', JSON.stringify(result));
                alert('Done');
                $updateProgressContainer.text('');
                $('#pf-display-data').show();
                fillRallyPoint(true);
            }, onUpdateError, onUpdateProgress);
        });

    }

    function makeTwButton(id, text) {
        return `<input type="button" id="${id}" class="btn evt-confirm-btn btn-confirm-yes" value="${text}">`;
    }

    function displayTargetInfo(coords) {
        $('#detailsVillages').empty();
        $('#detailsVillages').append(`<tbody>
        <tr class="title">
			<td style="background-color: rgb(193, 162, 100); background-image: url('https://dsen.innogamescdn.com/asset/fa6f0423/graphic/screen/tableheader_bg3.png'); background-repeat: repeat-x; font-weight: bold;"); background-repeat: repeat-x; font-weight: bold;">Nr.</td>
			<td style="background-color: rgb(193, 162, 100); background-image: url('https://dsen.innogamescdn.com/asset/fa6f0423/graphic/screen/tableheader_bg3.png'); background-repeat: repeat-x; font-weight: bold;"); background-repeat: repeat-x; font-weight: bold;">Player</td>
            <td style="background-color: rgb(193, 162, 100); background-image: url('https://dsen.innogamescdn.com/asset/fa6f0423/graphic/screen/tableheader_bg3.png'); background-repeat: repeat-x; font-weight: bold;"); background-repeat: repeat-x; font-weight: bold;">Village name</td>
            <td style="background-color: rgb(193, 162, 100); background-image: url('https://dsen.innogamescdn.com/asset/fa6f0423/graphic/screen/tableheader_bg3.png'); background-repeat: repeat-x; font-weight: bold;"); background-repeat: repeat-x; font-weight: bold;">Points</td>
            <td style="background-color: rgb(193, 162, 100); background-image: url('https://dsen.innogamescdn.com/asset/fa6f0423/graphic/screen/tableheader_bg3.png'); background-repeat: repeat-x; font-weight: bold;"); background-repeat: repeat-x; font-weight: bold;">Distance</td>
            </tr>
        </tbody>`);
        //create header
        for (var current = 0; current < coords.length; current++) {
            //create content
            createCurrentVillageTable("detailsVillages", current, [[current + 1, coords[current].value, "", "", ""]]);
        }
    }

    function createCurrentVillageTable(divID, villageNumber, tableData) {
        //make object from coord
        villageCoord = { value: tableData[0][1] };
        let villageData = findVillageData(villageCoord);

        var tableBody = document.getElementById(divID);
        $(tableBody).append(`<tr id="testVillage${villageNumber + 1}"><th>${villageNumber + 1}</th><th id="playerName${villageNumber + 1}"></th><th id="villageName${villageNumber + 1}"></th><th id="villagePoints${villageNumber + 1}"></th><th id="villageDistance${villageNumber + 1}"></th><th></th></tr>`);

        console.log(villageData.reports);
        if (villageData.reports != null) {
            console.log(villageData.reports[0].occurredAt.toLocaleString());
            lastHaul = "Last haul: " + villageData.reports[0].occurredAt.toLocaleString();
        }
        else {
            lastHaul = "Last haul: Unknown";
        }


        var currentReport = [];

        $.get(window.location.origin + `/game.php?&screen=api&ajax&screen=report&view=${villageData.reports[0].id}`, function (data) {
            thisReport = $(data).find(".report_ReportAttack")[0];
            currentReport.push(thisReport);
            console.log(currentReport);
            }).done(function()
            {
                $(`#reportSpoiler${villageNumber + 1}`).append(`<div style="margin:20px; margin-top:5px; max-width:100%"><div class="quotetitle"><b>Report:</b> <input type="button" value="Show" style="width:45px;font-size:10px;margin:0px;padding:0px;" onclick="if (this.parentNode.parentNode.getElementsByTagName('div')[1].getElementsByTagName('div')[0].style.display != '') { this.parentNode.parentNode.getElementsByTagName('div')[1].getElementsByTagName('div')[0].style.display = '';        this.innerText = ''; this.value = 'Hide'; } else { this.parentNode.parentNode.getElementsByTagName('div')[1].getElementsByTagName('div')[0].style.display = 'none'; this.innerText = ''; this.value = 'Show'; }" /></div><div class="quotecontent" ><div style="border:1px solid black;display: none;">${currentReport[0].innerHTML}</div></div></div>`);
            });

        // add collapse image
        $(`#testVillage${villageNumber + 1}`)[0].children[$(`#testVillage${villageNumber + 1}`)[0].children.length - 1].innerHTML = `<img data-hidden="false" class="toggle" style="display:block; margin-left: auto; margin-right: auto;cursor:pointer;" src="graphic/plus.png")></img>`;


        // add data from village to next row
        $(`#testVillage${villageNumber + 1}`).eq(0).after(`
        <tr id="details${villageNumber + 1}" style="display:none">
            <td></td>
            <td>Coordinate: ${villageData.coords}</td>
            <td>Village id: ${villageData.id}</td>
            <td>${lastHaul}</td>
            <td></td>
        </tr>
        <tr style="display:none">
            <td><span class="icon header wood"></span></td>
            <td id="woodHaul${villageNumber + 1}"></td>
            <td id="woodScout${villageNumber + 1}"></td>
            <td id="woodBuilding${villageNumber + 1}"></td>
            <td></td>
        </tr>
        <tr style="display:none">
            <td><span class="icon header stone"></span></td>
            <td id="clayHaul${villageNumber + 1}"></td>
            <td id="clayScout${villageNumber + 1}"></td>
            <td id="clayBuilding${villageNumber + 1}"></td>
            <td></td>
        </tr>
        <tr style="display:none">
            <td><span class="icon header iron"></span></td>
            <td id="ironHaul${villageNumber + 1}"></td>
            <td id="ironScout${villageNumber + 1}"></td>
            <td id="ironBuilding${villageNumber + 1}"></td>
            <td></td>
        </tr>
        <tr style="display:none"><td id="reportSpoiler${villageNumber + 1}" colspan=5><div></div></td></tr>`);

        //do the haul stuff
        if (villageData.reports[0].res.haul != null) {
            if (villageData.reports[0].res.haul.wood != null) {
                $(`#woodHaul${villageNumber + 1}`).text(`Last haul: ${villageData.reports[0].res.haul.wood}`);
            }
            else {
                $(`#woodHaul${villageNumber + 1}`).text(`Last haul: Looted all`);
            }
            if (villageData.reports[0].res.haul.clay != null) {
                $(`#clayHaul${villageNumber + 1}`).text(`Last haul: ${villageData.reports[0].res.haul.clay}`);
            }
            else {
                $(`#clayHaul${villageNumber + 1}`).text(`Last haul: Looted all`);
            }
            if (villageData.reports[0].res.haul.iron != null) {
                $(`#ironHaul${villageNumber + 1}`).text(`Last haul: ${villageData.reports[0].res.haul.iron}`);
            }
            else {
                $(`#ironHaul${villageNumber + 1}`).text(`Last haul: Looted all`);
            }
        }
        else {
            $(`#woodHaul${villageNumber + 1}`).text(`Last haul: No data`);
            $(`#clayHaul${villageNumber + 1}`).text(`Last haul: No data`);
            $(`#ironHaul${villageNumber + 1}`).text(`Last haul: No data`);
        }

        //do the scouty stuff
        if (villageData.reports[0].res.scouted != null) {
            if (villageData.reports[0].res.scouted.wood != null) {
                $(`#woodScout${villageNumber + 1}`).text(`Last scout: ${villageData.reports[0].res.scouted.wood}`);
            }
            else {
                $(`#woodScout${villageNumber + 1}`).text(`Last scout: No res left`);
            }
            if (villageData.reports[0].res.scouted.clay != null) {
                $(`#clayScout${villageNumber + 1}`).text(`Last scout: ${villageData.reports[0].res.scouted.clay}`);
            }
            else {
                $(`#clayScout${villageNumber + 1}`).text(`Last scout: No res left`);
            }
            if (villageData.reports[0].res.scouted.iron != null) {
                $(`#ironScout${villageNumber + 1}`).text(`Last scout: ${villageData.reports[0].res.scouted.iron}`);
            }
            else {
                $(`#ironScout${villageNumber + 1}`).text(`Last scout: No res left`);
            }
        }
        else {
            $(`#woodScout${villageNumber + 1}`).text(`Last scout: No data`);
            $(`#clayScout${villageNumber + 1}`).text(`Last scout: No data`);
            $(`#ironScout${villageNumber + 1}`).text(`Last scout: No data`);
        }

        //do the building stuff
        //grab estimates of pit levels

        estimatePitLevels([villageData], () => { });

        if (villageData.reports[0].buildings != null) {
            console.log("found buildings");
            $(`#woodBuilding${villageNumber + 1}`).text(`Building level: ${villageData.reports[0].buildings.wood}`);
            $(`#clayBuilding${villageNumber + 1}`).text(`Building level: ${villageData.reports[0].buildings.clay}`);
            $(`#ironBuilding${villageNumber + 1}`).text(`Building level: ${villageData.reports[0].buildings.iron}`);
        }
        else {
            console.log("didnt find buildings");
            $(`#woodBuilding${villageNumber + 1}`).text(`Building level estimate: ${villageData.estimates.woodLevel}`);
            $(`#clayBuilding${villageNumber + 1}`).text(`Building level estimate: ${villageData.estimates.clayLevel}`);
            $(`#ironBuilding${villageNumber + 1}`).text(`Building level estimate: ${villageData.estimates.ironLevel}`);
        }


        //add listener
        $(`#testVillage${villageNumber + 1}`).click(() => {
            console.log("Clicked");
            if ($(`#testVillage${villageNumber + 1}`)[0].children[$(`#testVillage${villageNumber + 1}`)[0].children.length - 1].children[0].src == window.location.origin + "/graphic/plus.png") {
                console.log('should go to minus');
                $(`#testVillage${villageNumber + 1}`)[0].children[$(`#testVillage${villageNumber + 1}`)[0].children.length - 1].children[0].src = "/graphic/minus.png";
                //change this to the rows after the header
                $(`#testVillage${villageNumber + 1}`)[0].nextElementSibling.style = "display:table-row";
                $(`#testVillage${villageNumber + 1}`)[0].nextElementSibling.nextElementSibling.style = "display:table-row";
                $(`#testVillage${villageNumber + 1}`)[0].nextElementSibling.nextElementSibling.nextElementSibling.style = "display:table-row";
                $(`#testVillage${villageNumber + 1}`)[0].nextElementSibling.nextElementSibling.nextElementSibling.nextElementSibling.style = "display:table-row";
                $(`#testVillage${villageNumber + 1}`)[0].nextElementSibling.nextElementSibling.nextElementSibling.nextElementSibling.nextElementSibling.style = "display:table-row";
            }
            else {
                console.log('should go to plus');
                $(`#testVillage${villageNumber + 1}`)[0].children[$(`#testVillage${villageNumber + 1}`)[0].children.length - 1].children[0].src = "/graphic/plus.png";
                //change this to the rows after the header
                $(`#testVillage${villageNumber + 1}`)[0].nextElementSibling.style = "display:none";
                $(`#testVillage${villageNumber + 1}`)[0].nextElementSibling.nextElementSibling.style = "display:none";
                $(`#testVillage${villageNumber + 1}`)[0].nextElementSibling.nextElementSibling.nextElementSibling.style = "display:none";
                $(`#testVillage${villageNumber + 1}`)[0].nextElementSibling.nextElementSibling.nextElementSibling.nextElementSibling.style = "display:none";
                $(`#testVillage${villageNumber + 1}`)[0].nextElementSibling.nextElementSibling.nextElementSibling.nextElementSibling.nextElementSibling.style = "display:none";
            }
        });

        // display village info
        var dataVillageInfo;
        $.get('/game.php?&screen=api&ajax=target_selection&input=' + villageData.coords + '+&type=coord', function (json) {
            dataVillageInfo =json;
        }).then(function()
        {
            console.log(dataVillageInfo);
            if (dataVillageInfo.villages[0].player_name != null) {
                $(`#playerName${villageNumber + 1}`).text(dataVillageInfo.villages[0].player_name);
            }
            else {
                $(`#playerName${villageNumber + 1}`).text("");
            }
            console.log(dataVillageInfo.villages[0].points);
            $(`#villageName${villageNumber + 1}`).text(dataVillageInfo.villages[0].name);
            $(`#villagePoints${villageNumber + 1}`)[0].innerHTML=dataVillageInfo.villages[0].points;
            $(`#villageDistance${villageNumber + 1}`).text(dataVillageInfo.villages[0].distance);
        });


    }

    /**
     * Rally point logic
     */

    function fillRallyPoint(reuseTarget, onDone, onError) {
        let availableTroops = getAvailableTroops();
        console.log('Got troops: ', availableTroops);

        let selectedComposition = getBestComposition(availableTroops);
        if (!selectedComposition) {
            if (!reuseTarget)
                alert('Not enough troops!');
            return;
        }

        let nextVillage;
        if (reuseTarget) {
            if (LastSelectedVillage) {
                nextVillage = parseCoord(LastSelectedVillage);
            } else {
                return;
            }
        } else {
            nextVillage = loadNextVillage();
        }

        LastSelectedVillage = nextVillage.value;

        let villageData = findVillageData(nextVillage);

        let latestReport = (villageData && villageData.reports) ? villageData.reports[0] : null;
        $('#player-farm-warning').remove();
        let $warningSibling = $('#command-data-form > table')
        if (latestReport) {
            if (latestReport.hasTroops) {
                let $targetElement = $('<p id="player-farm-warning">');
                $targetElement.html('<b>Warning: The latest report from this village showed troops at home. <a href="#">(Open report)</a></b>');
                $targetElement.insertAfter($warningSibling)

                $targetElement.find('a').click((e) => {
                    e.preventDefault();
                    let targetUrl = game_data.link_base_pure + 'report&view=' + latestReport.id;
                    window.open(targetUrl, '_blank');
                })
            }
        } else {
            let $targetElement = $('<p id="player-farm-warning">');
            $targetElement.html('<b>Warning: There are no recent reports on this village. (You might need to refresh your data.)</b>');
            $targetElement.insertAfter($warningSibling);
        }

        if (villageData) {
            calculateTroopsFromData(villageData, selectedComposition, (troopCounts) => applyTroopCounts(troopCounts));
        } else {
            let troopCounts = selectedComposition.map(unit => ({ name: unit.name, count: unit.min }));
            console.log('No village data available, using minimum for current composition');
            applyTroopCounts(troopCounts);
        }

        // Applies the expected number of troops and applies scout option
        function applyTroopCounts(troopCounts) {
            troopCounts = troopCounts.filter(t => t.count > 0);

            if (!containsScouts(troopCounts) && availableTroops['spy'] && settings.addScout)
                troopCounts.push({ name: 'spy', count: 1 });

            troopCounts = troopCounts.map((unit) => ({ name: unit.name, count: Math.min(unit.count, availableTroops[unit.name]) }));
            console.log('Fill counts after considering available troops: ', troopCounts);

            fillTroopCounts(troopCounts);
            onDone && onDone();
        }

        /**
         * Helper functions
         */

        function loadHistory() {
            return JSON.parse(localStorage.getItem(settings.cookieName) || '[]');
        }

        function saveHistory(history) {
            // should be array of coord strings, not parsed coord objects
            let coords = history.map(c => {
                if (typeof c == 'object') {
                    return c.value;
                } else {
                    return c;
                }
            });

            localStorage.setItem(settings.cookieName, JSON.stringify(coords));
        }

        function containsScouts(troops) {
            let scouts = troops.filter(t => t.name == 'spy');
            if (scouts.length) return scouts[0].count > 0;
            else return false;
        }

        function getAvailableTroops() {
            let availableTroops = {};
            game_data.units
                // Get counts for supported units
                .map(name => ({
                    name: name,
                    match: $(`#units_entry_all_${name}`).text().match(/(\d+)/)
                }))
                // Ignore units without any data (aka militia)
                .filter(d => d.match != null)
                // Process
                .map(d => ({
                    name: d.name,
                    count: parseInt(d.match[1])
                }))
                // Store in object
                .forEach((d) => {
                    availableTroops[d.name] = d.count;
                });

            return availableTroops;
        }

        function getBestComposition(availableTroops) {
            let availableCompositions = settings.allowedTroops
                .filter(comp => {
                    let unsatisfiedReqs = comp.filter(unit => availableTroops[unit.name] < unit.min);
                    return unsatisfiedReqs.length == 0;
                });

            if (availableCompositions.length)
                return availableCompositions[0];
            else
                return null;
        }

        function loadNextVillage() {
            let history = loadHistory();
            let availableVillages = targetCoords.filter(c => history.indexOf(c.value) < 0);
            if (availableVillages.length == 0) {
                alert('Gone through all villages, starting from the beginning');
                history = [];
                availableVillages = targetCoords;
                saveHistory(history);
            }

            let nextVillage = availableVillages[0];
            console.log('Filling rally point for village: ', nextVillage);

            history.push(nextVillage.value);
            saveHistory(history);

            let $coordsInput = $('input[data-type=player]');
            $coordsInput.val(nextVillage.value);
            $coordsInput.submit();
            return nextVillage;
        }

        function calculateTroopsFromData(villageData, composition, onDone) {
            console.log('Using stored data: ', villageData);
            let slowestUnit = getSlowestUnit(composition);
            console.log('Slowest unit is: ', slowestUnit);

            // These functions were originally supposed to process all village data, so we could skip
            // targets that might not have resources by the time the current attack lands. Just
            // a TODO for now
            villageData = [villageData];

            estimatePitLevels(villageData, () => {
                calculateResourceEstimates(villageData, (estimates) => {
                    modifyEstimatesForExistingCommands(villageData, estimates);
                    let estimate = estimates[0];
                    let currentResources = estimate.current;
                    let laterResources = estimate.afterTravel[slowestUnit];

                    console.log('Current resource estimate: ', currentResources);
                    console.log('Resource estimate after travel by ' + slowestUnit, laterResources);

                    let targetHaul = laterResources.total;
                    let bestTroops = getFarmTroopsFromComposition(composition, targetHaul);
                    console.log('Generated best troops: ', bestTroops);
                    let bestHaul = calculateMaxHaul(bestTroops);
                    console.log('Best troops will haul ' + bestHaul + ' for a target haul of ' + targetHaul);

                    let troopsArray = Object.keys(bestTroops).map(name => ({ name: name, count: bestTroops[name] }));
                    onDone(troopsArray);
                }, onError);
            }, onError);
        }

        function getFarmTroopsFromComposition(composition, targetHaul) {
            let troopsMin = {}, troopsMax = {};
            composition.forEach((unit) => {
                troopsMin[unit.name] = unit.min;
                troopsMax[unit.name] = unit.max;
            });

            let haulMin = calculateMaxHaul(troopsMin);
            let haulMax = calculateMaxHaul(troopsMax);

            // Ratio of troops required to reach the target haul
            let troopsRatio = (targetHaul - haulMin) / (haulMax - haulMin);
            troopsRatio = Math.min(1, troopsRatio);
            troopsRatio = Math.max(0, troopsRatio);

            console.log('Optimal haul ratio at: ', troopsRatio);
            console.log(`(based on min haul of ${haulMin} and max haul of ${haulMax} for target haul ${targetHaul})`);

            let result = {};
            composition.forEach((unit) => {
                let targetCount = unit.min + troopsRatio * (unit.max - unit.min);
                result[unit.name] = Math.ceil(targetCount);
            });

            return result;
        }

        function getSlowestUnit(troops) {
            // Make a copy first
            troops = troops.slice(0);
            let allSpeeds = Data.travelSpeeds();
            let troopSpeeds = troops.map(unit => ({ name: unit.name, speed: allSpeeds[unit.name] }));
            troopSpeeds.sort((a, b) => b.speed - a.speed);
            return troopSpeeds[0].name;
        }

        function fillTroopCounts(troops) {
            // convert from object to array if necessary
            if (!(troops instanceof Array)) {
                troops = Object.keys(troops).map((unit) => ({ name: unit, count: troops[unit] }));
            }

            $('input[id^=unit_input_]').val('');
            troops.forEach((unit) => $(`#unit_input_${unit.name}`).val(unit.count));
        }


    }

    function findVillageData(coord) {
        let matches = getSavedData().filter(v => v.coords == coord.value);
        if (matches.length > 0)
            return matches[0];
        else
            return null;
    }
    function addManagementInterfaceLink() {
        // TODO
        // Adds a link somewhere on rally point that opens main data management UI
        $('#playerFarmUI').remove();
        var openUI = `
            <div id="playerFarmUI" class="target-select clearfix vis" style="display:inline-block">
                <h4>Script tools:</h4>
                <table class="vis" style="width: 100%">
                    <tbody>
                        <tr>
                            <td>
                            ${makeTwButton('openUI', 'Open UI')}</td>
                        </tr>
                </tbody></table>
            </div>`;
        $("#command_actions").after(openUI);
        if(mobiledevice===true)$(".btn-support").after(openUI);
        $('#openUI').click(displayManagementUI);
    }



    /**
     * Data loading
     */

    function parseDate(text) {
        // Regular date parsing assumes text is in user's local time,
        // need to manually convert it to a UTC time
        let parsed = new Date(text);

        return new Date(
            Date.UTC(
                parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), parsed.getHours(), parsed.getMinutes(), parsed.getSeconds(), parsed.getMilliseconds()
            )
        );
    }

    function flattenArray(array) {
        let result = [];
        array.forEach((subarray) => result.push(...subarray));
        return result;
    }

    function checkContainsCaptcha(html) {
        return html.indexOf('data-bot-protect=') >= 0;
    }

    function currentServerDateTime() {
        return new Date(Timing.getCurrentServerTime() + window.server_utc_diff * 1000);
    }

    // requests for pages/etc, store results when done
    function updateTargetVillageData(
        onDone, // invoke when all tasks are complete and data is saved, onDone(loadedData)
        onError, // invoke when any error occurs, onError(errorInfo)
        onProgress // report progress of data loading, ie onProgress("loading village 5/22")
    ) {
        // will be ie { '500|500': 123, ... }
        var villageIds = {};
        // will be ie [ { targetCoord: '500|500', reportId: 456, reportUrl: reportLink1 }, ... ]
        var reportLinks = [];
        // will be ie { '500|500': [ report1, report2, etc. ]}, same format as villageData.reports
        var reportData = {};

        // Prefill with existing data
        getSavedData().forEach((village) => {
            reportData[village.coords] = village.reports;
            villageIds[village.coords] = village.id;
        });

        var existingReports = getSavedData().map(v => v.reports.map(r => r.id));
        existingReports = flattenArray(existingReports);


        // Get village IDs
        getVillageIds(() => {
            // Get report links after we get village IDs
            getVillageReportLinks(() => {
                // Get reports after we get all the links
                getReports(() => {
                    // Build the final data
                    var allVillageData = buildVillageData();
                    // Pass data to onDone
                    onDone(allVillageData);
                });
            });
        });

        // Gets IDs for all villas and stores in villageIds object
        function getVillageIds(onDone) {
            var villageInfoUrls = targetCoords
                .filter(c => !villageIds[c.value])
                .map(coord => ({ coord: coord, url: `game.php?&screen=api&ajax=target_selection&input=${coord.value}&type=coord` }));

            console.log('Made villa info URLs: ', villageInfoUrls);
            $.getAll(villageInfoUrls.map(u => u.url),
                (i, data) => {
                    onProgress && onProgress(makeProgressLabel('Getting village IDs', i, villageInfoUrls.length))

                    var coord = villageInfoUrls[i].coord;
                    var village = data.villages[0];
                    if (village)
                        villageIds[coord.value] = village.id;
                    else
                        villageIds[coord.value] = null;
                },
                () => {
                    onDone()
                },
                onError
            );
        }

        // Gets report links for all villas and stores in reportLinks object
        function getVillageReportLinks(onDone) {
            var villagePageUrls = targetCoords.map(coord => {
                let id = villageIds[coord.value];
                return `/game.php?&screen=info_village&id=${id}`;
            });

            $.getAll(villagePageUrls,
                (i, villagePage) => {

                    if (checkContainsCaptcha(villagePage)) {
                        throw "Captcha was triggered, refresh and try again";
                    }

                    // Pulling report links from villa page
                    var data = $(villagePage).find("#report_table")[0];

                    //find all URLs
                    var reportTag = $(data).find('input[type="checkbox"]').siblings("a");

                    //get report IDs and urls
                    var coord = targetCoords[i];
                    for (let i = 0; i < reportTag.length; i++) {
                        var currentReportID = reportTag[i].href.match(/(view\=)(\d*)/)[2];
                        // check that we haven't loaded this report before
                        if (existingReports.indexOf(currentReportID) < 0) {
                            reportLinks.push({
                                reportId: currentReportID,
                                reportUrl: reportTag[i].href,
                                targetCoord: coord.value
                            });
                        }
                    }

                    onProgress && onProgress(makeProgressLabel('Collecting report links', i, villagePageUrls.length));
                },
                onDone,
                onError
            )
        }

        //get report information, stores in reportData object
        function getReports(onDone) {
            $.getAll(reportLinks.map(l => l.reportUrl), // map from array of objects to array of urls
                (i, data) => {
                    if (checkContainsCaptcha(data)) {
                        throw "Captcha was triggered, refresh and try again";
                    }

                    var reportUrlInfo = reportLinks[i];
                    var currentReportPage = $(data);
                    var currentReportData = currentReportPage.find(".report_ReportAttack");

                    //check if scout data exists
                    var buildingDataCurrentReport = null;
                    if (($(currentReportData).find("#attack_spy_building_data")[0] == undefined) == false) {
                        //grab building data for current report
                        var buildingDataCurrentReport = JSON.parse($(currentReportData).find("#attack_spy_building_data")[0].value);
                        let woodData = buildingDataCurrentReport.filter(function (pit) { return pit.id == "wood" })[0];
                        let clayData = buildingDataCurrentReport.filter(function (pit) { return pit.id == "stone" })[0];
                        var ironData = buildingDataCurrentReport.filter(function (pit) { return pit.id == "iron" })[0];

                        // check that there's actually pit data in the report (happens if all pits lv 0)
                        if (woodData || clayData || ironData) {
                            buildingDataCurrentReport = {
                                wood: woodData ? parseInt(woodData.level) : 1,
                                clay: clayData ? parseInt(clayData.level) : 1,
                                iron: ironData ? parseInt(ironData.level) : 1
                            };
                        } else {
                            buildingDataCurrentReport = null;
                        }
                    }
                    
                    //check if haul data exists
                    if (($(currentReportData).find("#attack_results")[0] == undefined) == false) {
                        //collect haul data for current report
                        var woodHaul = parseInt($($(currentReportData).find('#attack_results .nowrap')[0]).text().replace(/[^\d\s]/g, ''));
                        var clayHaul = parseInt($($(currentReportData).find('#attack_results .nowrap')[1]).text().replace(/[^\d\s]/g, ''));
                        var ironHaul = parseInt($($(currentReportData).find('#attack_results .nowrap')[2]).text().replace(/[^\d\s]/g, ''));
                        var haulTotal;
                        if(mobiledevice===true)
                        {
                            haulTotal= $($(currentReportData).find("#attack_results tr td")[0]).contents().filter(function() {
                                return this.nodeType == 3;
                              }).text().trim();
                        }
                        else
                        {
                            haulTotal = $(currentReportData).find("#attack_results tr td")[1].innerText;
                        }
                       
                        console.log(haulTotal);
                        haulTotal = haulTotal.split("/");
                    }
                    else {
                        var woodHaul = null;
                    }

                    // if this is none, there is no info
                    if (($(currentReportData).find("#attack_spy_resources")[0] == undefined) == false) {
                        var scoutInfoExists = $($(currentReportData).find("#attack_spy_resources")[0]).find('td')[0].innerText;
                        var scoutedTroops = $.makeArray($(currentReportData).find('#attack_info_def_units tr:nth-of-type(2) .unit-item')).map(el => parseInt(el.innerText))

                        if ($(currentReportData).find('#attack_spy_away').length > 0) {
                            scoutedTroops = scoutedTroops.concat($.makeArray($(currentReportData).find('#attack_spy_away tr:nth-of-type(2) .unit-item')).map(el => parseInt(el.innerText)))
                        }

                        console.log('Got scouted troops: ', scoutedTroops);
                    }
                    if($(".report_ReportTrade").length>0)
                    {
                        buildingDataCurrentReport = null;
                        woodHaul=null;
                    }
                    console.log("Building data: ", buildingDataCurrentReport);

                    //collect spy data
                    if (reportData[reportUrlInfo.targetCoord]) {
                        // if coord already has report info keep adding to it.
                    }
                    else {
                        // create coord information
                        reportData[reportUrlInfo.targetCoord] = [];
                    }

                    //get battle time
                    
                    var timeOfBattle = parseDate(currentReportData[0].parentElement.parentElement.children[1].children[1].innerText);
                    var currentReport = {
                        "id": reportUrlInfo.reportId,
                        "res": {
                            "haul": {},
                            "scouted": {}
                        },
                        "buildings": {},
                        "wasMaxHaul": {},
                        "occurredAt": timeOfBattle
                    };

                    reportData[reportUrlInfo.targetCoord].push(currentReport);

                    // push scout info
                    if (scoutInfoExists == "none" || scoutInfoExists == null) {
                        currentReport.res.scouted = null;
                        currentReport.troopsSeen = null
                    }
                    else {
                        var woodScouted = parseInt($($(currentReportData).find('#attack_spy_resources span.nowrap')[0]).text().replace(/[^\d\s]/g, ''));
                        var clayScouted = parseInt($($(currentReportData).find('#attack_spy_resources span.nowrap')[1]).text().replace(/[^\d\s]/g, ''));
                        var ironScouted = parseInt($($(currentReportData).find('#attack_spy_resources span.nowrap')[2]).text().replace(/[^\d\s]/g, ''));
                        currentReport.res.scouted =
                            {
                                "wood": woodScouted,
                                "clay": clayScouted,
                                "iron": ironScouted
                            };
                    }

                    currentReport.hasTroops = scoutedTroops != null && (scoutedTroops.length == 0 || scoutedTroops.filter(cnt => cnt > 0).length > 0);

                    // push haul info
                    if (woodHaul != null) {
                        currentReport.res.haul =
                            {
                                "wood": woodHaul,
                                "clay": clayHaul,
                                "iron": ironHaul
                            };
                        if (haulTotal[0] == haulTotal[1]) {
                            currentReport.wasMaxHaul = true;
                        }
                        else {
                            currentReport.wasMaxHaul = false;
                        }
                    }
                    else {
                        currentReport.wasMaxHaul = null;
                        currentReport.res.haul = null;
                    }

                    //push building info
                    if (buildingDataCurrentReport != null) {
                        currentReport.buildings = buildingDataCurrentReport;
                    }
                    else {
                        currentReport.buildings = null;
                    }
                    console.table(reportData[reportUrlInfo.targetCoord]);

                    onProgress(makeProgressLabel('Loading reports', i, reportLinks.length));
                },
                onDone,
                onError
            );
        }

        // Takes all the downloaded info and returns the final village objects
        function buildVillageData() {
            return targetCoords.map((coord) => {
                // set up the data
                /*
                var villageData = { "coords": coord.value, "id": villageID, "reports": [], "estimates": {}, "currentCommands": [] };
                var villageReports = reportData[coord.value];*/

                return {
                    coords: coord.value,
                    id: villageIds[coord.value],
                    reports: reportData[coord.value] || [],
                    estimates: null,
                    currentCommands: []
                };
            });
        }
    }



    /**
     * Command tracking
     */

    // Should be ran on `screen=place&try=confirm`
    function storePendingCommand() {
        const targetId = $('.village_anchor').data('id');
        const savedData = getSavedData();
        const targetVillas = savedData.filter(v => v.id == targetId)

        let message = null;

        if (!targetVillas.length) {
            message = 'Not tracked - villa not registered';
        } else {
            const targetVilla = targetVillas[0];
            const durationText = $('#command-data-form > .vis:first-of-type > tbody > tr:nth-of-type(4) > td:nth-of-type(2)').text();
            const [hours, minutes, seconds] = durationText.split(':');
            const totalSeconds = parseInt(seconds) + 60 * (parseInt(minutes) + parseInt(hours) * 60);
            const now = currentServerDateTime();

            const haulSize = $('td > .icon.header').parent().text().match(/(\d+)/)[1];

            targetVilla.latestAttack = {
                landsAt: new Date(now.valueOf() + totalSeconds * 1000),
                sentAt: now,
                haulSize: parseInt(haulSize)
            };

            updateSavedData(savedData);
            message = 'Tracking';

            console.log('Stored command for village: ', targetVilla);
        }

        const $messageTarget = $('#command-data-form > h2');
        $messageTarget.text($messageTarget.text() + ` (${message})`);
    }



    /**
     * Data processing
     */

    function getWorldSettings(onDone, onError) {
        const lsKey = 'pf-worldsettings';
        if (localStorage.getItem(lsKey)) {
            const worldSettingsJson = localStorage.getItem(lsKey);
            //console.log('Loaded world settings from local storage: ', worldSettingsJson)
            let worldSettings = JSON.parse(worldSettingsJson);
            onDone(worldSettings.worldSpeed, worldSettings.unitSpeed);
        } else {
            const settingsUrl = `${window.location.origin}/interface.php?func=get_config`;
            console.log('Loading world settings from URL: ', settingsUrl);
            $.get(settingsUrl)
                .done((data) => {
                    let $xml = $(data);
                    console.log('Got XML', data, $xml);
                    let worldSettings = {
                        worldSpeed: parseFloat($xml.find('speed').text()),
                        unitSpeed: parseFloat($xml.find('unit_speed').text())
                    };
                    console.log('Found world settings: ', worldSettings);
                    localStorage.setItem(lsKey, JSON.stringify(worldSettings));
                    onDone(worldSettings.worldSpeed, worldSettings.unitSpeed);
                })
                .fail((xhr) => {
                    onError && onError(`Failed to load URL ${settingsUrl}: code ${xhr.status} / ${xhr.statusText}`);
                })
        }
    }

    function getResourceRates(onDone, onError) {
        getWorldSettings((worldSpeed) => {
            let pitResourceRates = [
                30, 35, 41, 47, 55, 64, 74, 86, 100, 117,
                136, 158, 184, 214, 249, 289, 337, 391, 455, 530,
                616, 717, 833, 969, 1127, 1311, 1525, 1774, 2063, 2400
            ];
            pitResourceRates.forEach((res, i) => pitResourceRates[i] = Math.ceil(res * worldSpeed));
            onDone(pitResourceRates);
        }, onError);
    }

    // sorts the given array based on the given dateProp in descending order (most recent
    // is first)
    function sortByDate(array, dateProp) {
        array.sort((a, b) => b[dateProp].valueOf() - a[dateProp].valueOf());
    }

    function reportHasData(report) {
        return report.res.haul || report.res.scouted;
    }

    function roundResources(resources) {
        return {
            wood: Math.round(resources.wood),
            clay: Math.round(resources.clay),
            iron: Math.round(resources.iron)
        };
    }

    // Get amount of res left over after looting
    function reportReminaingRes(report, resType) {
        if (report.res.scouted) {
            return report.res.scouted[resType];
        } else {
            return 0;
        }
    }

    // Get total amount of res shown in report
    function reportTotalRes(report, resType) {
        let total = 0;
        if (report.res.haul) total += report.res.haul[resType];
        if (report.res.scouted) total += report.res.scouted[resType];
        return total;
    }

    function calculateMaxHaul(troops) {
        const unitHauls = Data.unitHauls();

        let total = 0;
        Object.keys(troops).forEach((unit) => {
            let count = troops[unit];
            total += count * unitHauls[unit];
        });
        return total;
    }

    // Modifies villageData[].estimates, onDone() takes no params
    function estimatePitLevels(villageData, onDone, onError) {
        function estimatePitByResDifference(pitRates, resDiff, timeDiff) {
            let timeDiffHours = timeDiff / (1000 * 60 * 60);
            let resPerHour = resDiff / timeDiffHours;
            if (resPerHour <= 0)
                return 1;

            let pitLevel = 0;
            for (let i = 0; i < pitRates.length; i++) {
                // Keep updating pitLevel to the current level until
                // we hit a point where the given 'resPerHour' can't
                // meet the expected 'rate'
                let rate = pitRates[i];

                // arbitrary +3 to correct any off-by-one errors, ie lv5 @ 55/hr, but we've detected 54/hr - should
                // be detected as lv5 but would use lv4 instead because of that small difference..
                if (resPerHour + 3 >= rate)
                    pitLevel = i + 1;
                else
                    break;
            }
            return pitLevel;
        }

        // pitName needs to match the name of reports[].buildings, ie 'wood'/'clay'/'iron'
        function estimatePit(pitRates, village, pitName) {
            let highestPitLevel = 1;
            // Pull from latest report first, if available
            for (let i = 0; i < village.reports.length; i++) {
                let report = village.reports[i];
                if (report.buildings) {
                    highestPitLevel = Math.max(highestPitLevel, report.buildings[pitName]);
                    break;
                }
            }

            let usefulReports = village.reports
                // Skip reports that had max haul and didn't have any scout on resources
                .filter(r => r.res.scouted != null || !r.wasMaxHaul)
                // Skip reports without any useful data
                .filter(r => reportHasData(r));

            //Dialog.show("content",JSON.stringify(usefulReports));
            sortByDate(usefulReports, 'occurredAt');

            // Compare time and res between reports
            for (let i = 1; i < usefulReports.length; i++) {
                // first is earlier than second
                let first = usefulReports[i - 1];
                let second = usefulReports[i];

                // time between reports in ms
                let timeDifference = first.occurredAt.valueOf() - second.occurredAt.valueOf();
                let previousLeftoverRes = reportReminaingRes(second, pitName);
                let currentTotalRes = reportTotalRes(first, pitName);

                // detect possible pit level
                let resGainedBetweenReports = currentTotalRes - previousLeftoverRes;
                let expectedPitLevel = estimatePitByResDifference(pitRates, resGainedBetweenReports, timeDifference);

                // take the highest level seen
                highestPitLevel = Math.max(expectedPitLevel, highestPitLevel);
            }
            return highestPitLevel;
        }

        getResourceRates((pitResourceRates) => {
            villageData.forEach((village) => {
                village.estimates = {
                    woodLevel: estimatePit(pitResourceRates, village, 'wood'),
                    clayLevel: estimatePit(pitResourceRates, village, 'clay'),
                    ironLevel: estimatePit(pitResourceRates, village, 'iron')
                };
            });

            console.log('Generated estimates');
            console.table(villageData.map(v => ({ coords: v.coords, ...v.estimates })));
            onDone();
        });
    }

    // Modifies given resource estimates based on max hauls from existing commands
    // that are still traveling
    function modifyEstimatesForExistingCommands(villageData, estimates) {
        // TODO: Use settings.prioritizeExistingCommands option here
        // (Need to know what troop type is being used in the pending attack though)
        estimates.forEach((estimate, i) => {
            let village = villageData[i];
            let relevantCommands = village.currentCommands || [];
            let totalHaul = 0;
            relevantCommands.forEach((cmd) => totalHaul += calculateMaxHaul(cmd.troops));
            console.log('Total haul: ', totalHaul);

            estimate.current = resourcesAfterHaul(estimate.current, totalHaul);
            Object.keys(estimate.afterTravel).forEach((unit) => {
                estimate.afterTravel[unit] = resourcesAfterHaul(estimate.afterTravel[unit], totalHaul);
            });
        });

        function resourcesAfterHaul(resources, maxHaul) {
            let proportionTaken = resources.total > 0
                ? Math.min(maxHaul / resources.total, 1)
                : 1;
            //console.log('Proportion taken: ', proportionTaken);
            let proportionRemaining = 1 - proportionTaken;

            let result = roundResources({
                wood: resources.wood * proportionRemaining,
                clay: resources.clay * proportionRemaining,
                iron: resources.iron * proportionRemaining
            });

            result.total = result.wood + result.clay + result.iron;
            return result;
        }
    }

    // Returns array of estimated resources for the given villages, both current and after travel
    // by different unit speeds (not considering existing commands)
    function calculateResourceEstimates(villageData, onDone, onError) {
        var currentCoords = {
            x: game_data.village.x,
            y: game_data.village.y,
            value: game_data.village.coord
        };

        getResourceRates((pitRates) => {
            let currentResources = estimateCurrentResources(pitRates);
            console.log("Current resource estimates: ", currentResources);
            getWorldSettings((gameSpeed, unitSpeed) => {
                let travelModifier = gameSpeed * unitSpeed;
                let resourceEstimates = calculateResourcesAfterTravel(currentResources, travelModifier, pitRates)
                onDone(resourceEstimates);
            }, onError);
        });

        function estimateCurrentResources(pitRates) {
            return villageData.map((village) => {
                let validReports = village.reports.filter(reportHasData);
                sortByDate(validReports, 'occurredAt');
                let latestReport = validReports.length
                    ? validReports[0]
                    : null;

                let lastSeenResources = latestReport
                    ? latestReport.res.scouted || { wood: 0, clay: 0, iron: 0 }
                    : { wood: 0, clay: 0, iron: 0 };

                let now = currentServerDateTime();
                // time in ms
                let timeSinceReport = latestReport
                    ? now.valueOf() - latestReport.occurredAt.valueOf()
                    : 0;

                let hoursSinceReport = timeSinceReport / (60 * 60 * 1000);
                console.log('Estimating current resources using report from ' + hoursSinceReport + ' hours ago');

                hoursSinceReport = Math.min(hoursSinceReport, settings.methodOptions.total.maxHourlyProjection);

                let currentResources = roundResources({
                    wood: lastSeenResources.wood + hoursSinceReport * pitRates[village.estimates.woodLevel - 1],
                    clay: lastSeenResources.clay + hoursSinceReport * pitRates[village.estimates.clayLevel - 1],
                    iron: lastSeenResources.iron + hoursSinceReport * pitRates[village.estimates.ironLevel - 1]
                });

                currentResources.total = currentResources.wood + currentResources.clay + currentResources.iron;

                return currentResources;
            });
        }

        function distance(a, b) {
            return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
        }

        function calculateResourcesAfterTravel(currentEstimates, travelModifier, pitRates) {
            let travelSpeeds = Data.travelSpeeds()
            let validUnits = game_data.units.filter(u => !!travelSpeeds[u]);
            validUnits.forEach((name) => travelSpeeds[name] /= travelModifier);
            console.log('Made effective travel speeds: ', travelSpeeds);

            let resourceEstimates = [];
            villageData.forEach((village, i) => {
                let dist = distance(currentCoords, parseCoord(village.coords));
                let travelTimes = validUnits.map(unit => ({
                    unit: unit,
                    seconds: Math.round(travelSpeeds[unit] * 60 * dist)
                }));
                console.log('Made travel times for village ' + village.coords)
                //console.table(
                console.log(
                    travelTimes.map(t => ({ ...t, speed: travelSpeeds[t.unit] }))
                );

                let villageCurrentEstimate = currentEstimates[i];
                let travelResourceEstimates = {};
                travelTimes.forEach((t) => {
                    let travelHours = t.seconds / (60 * 60);
                    let resourcesCreated = {
                        wood: Math.ceil(pitRates[village.estimates.woodLevel - 1] * travelHours),
                        clay: Math.ceil(pitRates[village.estimates.clayLevel - 1] * travelHours),
                        iron: Math.ceil(pitRates[village.estimates.ironLevel - 1] * travelHours)
                    };

                    let totalResources = roundResources({
                        wood: resourcesCreated.wood + villageCurrentEstimate.wood,
                        clay: resourcesCreated.clay + villageCurrentEstimate.clay,
                        iron: resourcesCreated.iron + villageCurrentEstimate.iron
                    });
                    totalResources.total = totalResources.wood + totalResources.clay + totalResources.iron;
                    travelResourceEstimates[t.unit] = totalResources;
                });

                resourceEstimates.push({
                    villageCoords: village.coords,
                    villageId: village.id,
                    current: villageCurrentEstimate,
                    afterTravel: travelResourceEstimates
                })
            });

            return resourceEstimates;
        }
    }

})();