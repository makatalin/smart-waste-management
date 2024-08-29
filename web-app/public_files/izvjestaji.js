// ****************************
// GENERIRANJE BOJA
// ****************************

function generateColor(index) {
    const hue = index * 137.5; // Pomicanje nijanse kako bi se izbjegle slične boje
    const backgroundColor = `hsla(${hue % 360}, 70%, 60%, 0.4)`;
    const borderColor = `hsla(${hue % 360}, 70%, 40%, 0.6)`;
    return { backgroundColor, borderColor };
}

const colorMap = new Map();

function assignColorsToContainers(labels) {
    labels.forEach((label, index) => {
        if (!colorMap.has(label)) {
            const colors = generateColor(colorMap.size);
            colorMap.set(label, {
                backgroundColor: colors.backgroundColor,
                borderColor: colors.borderColor
            });
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {

// ****************************
// KALENDAR
// ****************************

    // Regionalne postavke kalendara
    $.datepicker.setDefaults($.datepicker.regional['hr']);

    $.datepicker.regional['hr'] = {
        closeText: 'Zatvori',
        prevText: '&#x3C;',
        nextText: '&#x3E;',
        currentText: 'Danas',
        monthNames: ['Siječanj', 'Veljača', 'Ožujak', 'Travanj', 'Svibanj', 'Lipanj',
            'Srpanj', 'Kolovoz', 'Rujan', 'Listopad', 'Studeni', 'Prosinac'
        ],
        monthNamesShort: ['Sij', 'Velj', 'Ožu', 'Tra', 'Svi', 'Lip',
            'Srp', 'Kol', 'Ruj', 'Lis', 'Stu', 'Pro'
        ],
        dayNames: ['Nedjelja', 'Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota'],
        dayNamesShort: ['Ned', 'Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub'],
        dayNamesMin: ['Ne', 'Po', 'Ut', 'Sr', 'Če', 'Pe', 'Su'],
        weekHeader: 'Tje',
        dateFormat: 'yy-mm-dd',
        firstDay: 1,
        isRTL: false,
        showMonthAfterYear: false,
        yearSuffix: ''
    };
    $.datepicker.setDefaults($.datepicker.regional['hr']);

    // Dohvaćanje spremljenog datuma
    const storedStartDate = localStorage.getItem('startDate');
    const storedEndDate = localStorage.getItem('endDate');

    let endDate = storedEndDate ? new Date(storedEndDate) : new Date();
    let startDate = storedStartDate ? new Date(storedStartDate) : new Date();

    if (!storedStartDate || !storedEndDate) {
        startDate.setDate(endDate.getDate() - 7);
    }

    // Inicijalizacija izbornika datuma
    $('#start-date').datepicker({
        dateFormat: 'yy-mm-dd',
        defaultDate: startDate,
        onSelect: function() {
            const startDate = $.datepicker.formatDate('yy-mm-dd', $('#start-date').datepicker('getDate'));
            const endDate = $.datepicker.formatDate('yy-mm-dd', $('#end-date').datepicker('getDate'));
            localStorage.setItem('startDate', startDate);
            localStorage.setItem('endDate', endDate);
            fetchAndDisplayData(startDate, endDate);  
        }
    }).datepicker('setDate', startDate);
    
    $('#end-date').datepicker({
        dateFormat: 'yy-mm-dd',
        defaultDate: endDate,
        onSelect: function() {
            const startDate = $.datepicker.formatDate('yy-mm-dd', $('#start-date').datepicker('getDate'));
            const endDate = $.datepicker.formatDate('yy-mm-dd', $('#end-date').datepicker('getDate'));
            localStorage.setItem('startDate', startDate);
            localStorage.setItem('endDate', endDate);
            fetchAndDisplayData(startDate, endDate);
        }
    }).datepicker('setDate', endDate);

// ****************************
// DOHVAĆANJE I PRIKAZ PODATAKA
// ****************************

    function fetchAndDisplayData(startDate, endDate) {
        localStorage.setItem('startDate', startDate);
        localStorage.setItem('endDate', endDate);
    
        fetch(`/rest/izvjestaji?start=${startDate}&end=${endDate}`)
            .then(response => response.json())
            .then(data => {
                if (data) {
                    //console.log('Dohvaćeni podaci za izvještaje:', data);
                    // Priprema podataka za displayChart funkciju
                    const wasteAmountData = {
                        ...data.wasteAmount,
                        startDate: startDate,
                        endDate: endDate
                    };
    
                    const emptyingFrequencyData = {
                        ...data.emptyingFrequency,
                        startDate: startDate,
                        endDate: endDate
                    };
    
                    const averageFillLevelData = {
                        ...data.averageFillLevel,
                        startDate: startDate,
                        endDate: endDate
                    };
    
                    const overflowCountData = {
                        ...data.overflowCount,
                        startDate: startDate,
                        endDate: endDate
                    };
    
                    const areaUsageData = {
                        labels: data.areaUsage.labels,
                        averageFillValues: data.areaUsage.averageFillValues,
                        emptyingCountValues: data.areaUsage.emptyingCountValues,
                        containerCountValues: data.areaUsage.containerCountValues
                    };

                    const wasteVolumeByTypeData = {
                        ...data.wasteVolumeByType,
                        startDate: startDate,
                        endDate: endDate
                    };
    
                    // Provjera i uklanjanje grafikona (ako postoje)
                    if (Chart.getChart('wasteAmountChart')) {
                        Chart.getChart('wasteAmountChart').destroy();
                    }
                    if (Chart.getChart('emptyingFrequencyChart')) {
                        Chart.getChart('emptyingFrequencyChart').destroy();
                    }
                    if (Chart.getChart('averageFillLevelChart')) {
                        Chart.getChart('averageFillLevelChart').destroy();
                    }
                    if (Chart.getChart('overflowCountChart')) {
                        Chart.getChart('overflowCountChart').destroy();
                    }
                    if (Chart.getChart('averageFillLevelByAreaChart')) {
                        Chart.getChart('averageFillLevelByAreaChart').destroy();
                    }
                    if (Chart.getChart('wasteVolumePieChart')) {
                        Chart.getChart('wasteVolumePieChart').destroy();
                    }

                    // Prikaz grafova s podacima
                    displayWasteAmountChart('wasteAmountChart', 'Količina otpada', wasteAmountData, 'line');
                    displayHeatmapChart('emptyingFrequencyChart', 'Učestalost pražnjenja', emptyingFrequencyData, 'heatmap');
                    displayAverageFillLevelChart('averageFillLevelChart', 'Prosječna napunjenost', averageFillLevelData, 'bar');
                    displayOverflowCountChart('overflowCountChart', 'Napunjenost veća od 75%', overflowCountData, 'bar');
                    displayHorizontalBarChart('averageFillLevelByAreaChart', areaUsageData, 'groupedBar');
                    displayWasteVolumePieChart('wasteVolumePieChart', wasteVolumeByTypeData, 'pie');
                } else {
                    console.error('Nema podataka');
                }
            })
            .catch(error => console.error('Greška u dohvaćanju podataka: ', error));
    }
    
    // Učitavanje podataka za zadnjih tjedan dana prilikom prvog učitavanja stranice
    fetchAndDisplayData(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]);    
});

// ****************************
// GENERIRANJE RASPONA DATUMA
// ****************************

function generateDateRange(startDate, endDate) {
    const dates = [];
    let currentDate = new Date(startDate);

    while (currentDate <= new Date(endDate)) {
        dates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
}

// ****************************
// PRIKAZIVANJE GRAFOVA
// ****************************

// Graf "Ukupna količina otpada u m3"
function displayWasteAmountChart(canvasId, label, data) {
    if (!data || !data.labels || data.labels.length === 0 || !data.values || data.values.length === 0) {
        console.warn(`Nema podataka za grafikon ${label}.`);
        return;
    }

    const ctx = document.getElementById(canvasId).getContext('2d');
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    const allDates = generateDateRange(startDate, endDate);

    const formattedLabels = allDates.map(date => date.toISOString().split('T')[0]);
    const dataMap = new Map(data.labels.map((label, index) => [label, data.values[index]]));
    const formattedData = formattedLabels.map(label => dataMap.get(label) || 0);

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: formattedLabels,
            datasets: [{
                label: label,
                data: formattedData,
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Ukupna količina otpada u m³',
                    font: {
                        size: 18,
                        weight: 'normal'
                    },
                    padding: {
                        top: 10,
                        bottom: 20
                    }
                },
                legend: {
                    display: false,
                },
                tooltip: {
                    enabled: true,
                    callbacks: {
                        label: function(context) {
                            return `${context.formattedValue} m³`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        drawBorder: true,
                        borderWidth: 1,
                        drawOnChartArea: true,
                        drawTicks: true
                    },
                    type: 'time',
                    time: {
                        unit: 'day',
                        displayFormats: {
                            day: 'd.M.'
                        }
                    },
                    ticks: {
                        callback: function(value, index) {
                            const date = new Date(value);
                            const day = date.getDate();
                            const month = date.getMonth() + 1;
                            return `${day}.${month}.`;
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value;
                        }
                    }
                }
            }
        }
    });
}

// Graf "Razvrstane količine otpada"
function displayWasteVolumePieChart(canvasId, data) {
    if (!data || !data.labels || data.labels.length === 0 || !data.values || data.values.length === 0) {
        console.warn(`Nema podataka za grafikon ${label}.`);
        return;
    }

    const ctx = document.getElementById(canvasId).getContext('2d');
    const formattedLabels = data.labels;
    const formattedData = data.values;

    assignColorsToContainers(formattedLabels);

    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: formattedLabels,
            datasets: [{
                data: formattedData,
                backgroundColor: formattedLabels.map(label => colorMap.get(label)?.backgroundColor || 'rgba(75, 192, 192, 0.4)'),
                borderColor: formattedLabels.map(label => colorMap.get(label)?.borderColor || 'rgba(75, 192, 192, 1)'),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Razvrstane količine otpada',
                    font: {
                        size: 18,
                        weight: 'normal'
                    },
                    padding: {
                        top: 10,
                        bottom: 20
                    }
                },
                legend: {
                    display: true,
                    position: 'right',
                    labels: {
                        boxWidth: 15,
                        padding: 10
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw;
                            return `${value.toFixed(2)} m³`;
                        }
                    }
                }
            }
        }
    });
}

// Graf "Prosječna napunjenost spremnika"
function displayAverageFillLevelChart(canvasId, label, data) {
    if (!data || !data.labels || data.labels.length === 0 || !data.values || data.values.length === 0) {
        console.warn(`Nema podataka za grafikon ${label}.`);
        return;
    }
    
    const ctx = document.getElementById(canvasId).getContext('2d');
    const formattedLabels = data.labels;
    const formattedData = data.values;

    assignColorsToContainers(data.labels);

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: formattedLabels,
            datasets: [{
                label: label,
                data: formattedData,
                backgroundColor: (context) => {
                    const label = data.labels[context.dataIndex];
                    return colorMap.get(label)?.backgroundColor || 'rgba(75, 192, 192, 0.2)';
                },
                borderColor: (context) => {
                    const label = data.labels[context.dataIndex];
                    return colorMap.get(label)?.borderColor || 'rgba(75, 192, 192, 1)';
                },
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Prosječna napunjenost spremnika',
                    font: {
                        size: 18,
                        weight: 'normal'
                    },
                    padding: {
                        top: 10,
                        bottom: 20
                    }
                },
                legend: {
                    display: false,
                },
                tooltip: {
                    enabled: true,
                    callbacks: {
                        label: function(context) {
                            return `${context.formattedValue}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: false,
                    grid: {
                        drawBorder: true,
                        drawOnChartArea: false
                    },
                    type: 'category',
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            }
        }
    });
}

// Graf "Prosječna napunjenost spremnika prema području"
function displayHorizontalBarChart(canvasId, data) {
    if (!data || !data.labels || data.labels.length === 0 || !data.averageFillValues || data.averageFillValues.length === 0) {
        console.warn(`Nema podataka za grafikon ${label}.`);
        return;
    }

    const ctx = document.getElementById(canvasId).getContext('2d');

    const formattedData = [
        {
            label: 'Prosječna napunjenost %',
            data: data.averageFillValues,
            backgroundColor: 'rgba(75, 192, 192, 0.5)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1,
        },
        {
            label: 'Učestalost pražnjenja',
            data: data.emptyingCountValues,
            backgroundColor: 'rgba(153, 102, 255, 0.5)',
            borderColor: 'rgba(153, 102, 255, 1)',
            borderWidth: 1,
        },
        {
            label: 'Broj spremnika',
            data: data.containerCountValues,
            backgroundColor: 'rgba(255, 159, 64, 0.5)',
            borderColor: 'rgba(255, 159, 64, 1)',
            borderWidth: 1,
        }
    ];

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: formattedData
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Prosječna napunjenost prema području',
                    font: {
                        size: 18,
                        weight: 'normal'
                    },
                    padding: {
                        top: 10,
                        bottom: 20
                    }
                },
                legend: {
                    display: true,
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.dataset.label || '';
                            const value = context.raw;
                
                            if (label === 'Prosječna napunjenost %') {
                                return `${parseFloat(value).toFixed(2)}%`;
                            } else if (label === 'Učestalost pražnjenja') {
                                return `${value} puta`;
                            } else if (label === 'Broj spremnika') {
                                return `${value} spremnika`;
                            } else {
                                return `${label}: ${value}`;
                            }
                        }
                    },
                    displayColors: true,
                }
                
            },
            scales: {
                x: {
                    stacked: true,
                    display: true,
                    grid: {
                        drawBorder: true,
                        borderWidth: 1,
                        drawOnChartArea: true,
                        drawTicks: true
                    },
                },
                y: {
                    stacked: true,
                    display: true,
                    grid: {
                        drawBorder: true,
                        borderWidth: 1,
                        drawOnChartArea: true,
                        drawTicks: true
                    },
                }
            }
        }
    });
}

// Graf "Puni spremnici"
function displayOverflowCountChart(canvasId, label, data) {
    if (!data || !data.labels || data.labels.length === 0 || !data.values || data.values.length === 0) {
        console.warn(`Nema podataka za grafikon ${label}.`);
        return;
    }

    const ctx = document.getElementById(canvasId).getContext('2d');
    const formattedLabels = data.labels;
    const formattedData = data.values;

    assignColorsToContainers(data.labels);

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: formattedLabels,
            datasets: [{
                label: label,
                data: formattedData,
                backgroundColor: (context) => {
                    const label = data.labels[context.dataIndex];
                    return colorMap.get(label)?.backgroundColor || 'rgba(255, 99, 132, 0.2)';
                },
                borderColor: (context) => {
                    const label = data.labels[context.dataIndex];
                    return colorMap.get(label)?.borderColor || 'rgba(255, 99, 132, 1)';
                },
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Puni spremnici',
                    font: {
                        size: 18,
                        weight: 'normal'
                    },
                    padding: {
                        top: 10,
                        bottom: 20
                    }
                },
                legend: {
                    display: false,
                },
                tooltip: {
                    enabled: true,
                    callbacks: {
                        label: function(context) {
                            return `${context.formattedValue}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: false,
                    grid: {
                        drawBorder: true,
                        drawOnChartArea: false,
                    },
                    type: 'category',
                    ticks: {
                        display: true,
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            }
        }
    });
}

// Graf "Učestalost pražnjenja spremnika"
function displayHeatmapChart(canvasId, label, data) {
    if (!data || !data.labels || data.labels.length === 0 || !data.values || data.values.length === 0) {
        console.warn(`Nema podataka za grafikon ${label}.`);
        return;
    }

    const ctx = document.getElementById(canvasId).getContext('2d');
    
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    const allDates = generateDateRange(startDate, endDate).map(date => date.toISOString().split('T')[0]);

    const formattedData = data.labels.map((label, index) => {
        const emptyDatesArray = data.emptyDatesValues[index].split(',');
        return emptyDatesArray.map(date => {
            return {
                x: date.trim(),
                y: index, 
                r: 8,
                v: data.values[index]
            };
        });
    }).flat();

    const heatmapData = {
        datasets: [{
            label: 'Pražnjenje Spremnika',
            data: formattedData,
            backgroundColor: function(context) {
                const value = context.dataset.data[context.dataIndex].v;
                const alpha = value / Math.max(...formattedData.map(d => d.v));
                return `rgba(255, 99, 132, ${alpha})`;
            },
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1
        }]
    };

    const heatmapOptions = {
        scales: {
            x: {
                type: 'time',
                time: {
                    unit: 'day',
                    tooltipFormat: 'dd.MM.yyyy',
                    displayFormats: {
                        day: 'dd.MM.'
                    }
                },
                grid: {
                    display: false,
                }
            },
            y: {
                type: 'category',
                labels: data.labels,
                offset: true,
                grid: {
                    display: false,
                }
            }
        },
        plugins: {
            title: {
                display: true,
                text: 'Učestalost pražnjenja spremnika',
                font: {
                    size: 18, 
                    weight: 'normal'
                },
                padding: {
                    top: 10,
                    bottom: 20
                }
            },
            legend: {
                display: false
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const date = context.raw.x;
                        const [year, month, day] = date.split('-');
                        return `${parseInt(day)}.${parseInt(month)}.${year}`; 
                    }
                }
            }
        }
    };

    new Chart(ctx, {
        type: 'bubble',
        data: heatmapData,
        options: heatmapOptions
    });

    return;
}
