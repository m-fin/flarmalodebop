// Calendar screen, today's meetup banner, and chat cards. DOM only.
(function (root) {
  const C = () => root.FlarmCalendar;
  let api = null;
  const ui = {
    anchor: null,
    day: null,
    chip: 0,
    duration: 90,
    slot: 0,
    spot: 'Golden Corral',
    ride: '',
  };

  function h(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function today() {
    return C().todayIso();
  }

  function cal() {
    return api.calendar() || C().emptyCalendar();
  }

  function fail(error) {
    const message = (error && error.message) || 'That didn’t save.';
    api.toast(message.replace(/^.*?:\s*/, '').slice(0, 180));
  }

  function selectedWindows() {
    const me = api.me();
    const other = api.other();
    if (!me || !other || !ui.day) return [];
    return C().overlapWindows({
      shifts: cal().shifts,
      daysOff: cal().daysOff,
      meId: me.id,
      themId: other.id,
      day: ui.day,
    });
  }

  function currentSlot() {
    const windows = selectedWindows();
    const window = windows[ui.chip] || windows[0];
    if (!window) return null;
    const durations = C().durationChoices(window);
    const duration = durations.includes(ui.duration) ? ui.duration : durations[durations.length - 1];
    const slots = C().slotChoices(window, duration);
    const slot = slots[ui.slot] || slots[0] || C().suggestSlot(window, duration);
    return { window, duration, slots, slot };
  }

  function renderBanner() {
    const banner = document.querySelector('#meetupBanner');
    if (!banner) return;
    const meetup = C().todaysConfirmed(cal().meetups, today());
    const copy = C().bannerCopy(meetup);
    banner.classList.toggle('hidden', !copy);
    banner.replaceChildren();
    if (!copy) return;
    banner.append(h('span', 'banner-kicker', copy.title), h('strong', 'banner-detail', copy.detail));
    if (copy.ride) banner.append(h('span', 'banner-ride', copy.ride));
  }

  function personColumn(title, userId) {
    const col = h('div', 'shift-col');
    col.append(h('div', 'shift-who', title));
    const day = ui.day;
    const weekday = C().weekdayOf(day);
    const off = cal().daysOff.some((row) => row.userId === userId && row.date === day);
    if (off) col.append(h('p', 'muted small', 'Off this date'));
    const rows = cal().shifts.filter((shift) => shift.userId === userId && (shift.date === day || (!shift.date && shift.weekday === weekday && !off)));
    if (!rows.length && !off) col.append(h('p', 'muted small', 'No shift'));
    rows.forEach((shift) => {
      const line = h('div', 'shift-pill');
      line.append(h('span', null, (shift.date ? 'Just this date · ' : '') + shift.label + ' · ' + C().formatRange(shift.start, shift.end)));
      col.append(line);
    });
    return col;
  }

  function renderScreen() {
    const rootNode = document.querySelector('#calendarScroll');
    if (!rootNode || !api.me()) return;
    const me = api.me();
    const other = api.other();
    const days = C().weekDates(ui.anchor || today());
    rootNode.replaceChildren();

    const banner = h('div', 'cal-banner');
    const copy = C().bannerCopy(C().todaysConfirmed(cal().meetups, today()));
    if (copy) {
      banner.append(h('div', 'banner-kicker', copy.title), h('strong', null, copy.detail));
      if (copy.ride) banner.append(h('div', 'muted small', copy.ride));
      const add = h('button', 'chip-btn', 'Add to calendar');
      add.type = 'button';
      add.onclick = () => api.downloadIcs(C().todaysConfirmed(cal().meetups, today()));
      banner.append(add);
    } else {
      banner.append(h('div', 'banner-kicker', 'No restaurant meetup locked in for today'));
    }
    rootNode.append(banner);

    const week = h('div', 'week-row');
    const prev = h('button', 'chip-btn', '←');
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Previous week');
    prev.onclick = () => { ui.anchor = C().addDays(ui.anchor, -7); renderScreen(); };
    const next = h('button', 'chip-btn', '→');
    next.type = 'button';
    next.setAttribute('aria-label', 'Next week');
    next.onclick = () => { ui.anchor = C().addDays(ui.anchor, 7); renderScreen(); };
    week.append(prev);
    days.forEach((day) => {
      const btn = h('button', 'day-chip' + (day === ui.day ? ' on' : ''), C().WEEKDAYS[C().weekdayOf(day)] + '\n' + Number(day.slice(-2)));
      btn.type = 'button';
      if (day === today()) btn.classList.add('today');
      const meetup = cal().meetups.find((row) => row.day === day && row.status !== 'cancelled');
      if (meetup) btn.classList.add(meetup.status === 'confirmed' ? 'locked' : 'proposed');
      btn.onclick = () => { ui.day = day; ui.chip = 0; ui.slot = 0; renderScreen(); };
      week.append(btn);
    });
    week.append(next);
    rootNode.append(week);

    rootNode.append(h('h2', 'cal-heading', C().formatDayLabel(ui.day, today())));
    const cols = h('div', 'shift-cols');
    cols.append(personColumn(me.display, me.id), personColumn(other.display, other.id));
    rootNode.append(cols);

    rootNode.append(h('h3', 'cal-kicker', 'Openings for a restaurant meetup'));
    const windows = selectedWindows();
    const chips = h('div', 'chip-row');
    if (!windows.length) chips.append(h('p', 'muted', 'No shared opening that day. A day off or a shorter shift opens one up.'));
    windows.forEach((window, index) => {
      const btn = h('button', 'choice-chip' + (index === ui.chip ? ' on' : ''), window.label + ' · ' + C().formatRange(window.start, window.end));
      btn.type = 'button';
      const hint = h('span', 'chip-hint', window.hint);
      btn.append(hint);
      btn.onclick = () => { ui.chip = index; ui.slot = 0; renderScreen(); };
      chips.append(btn);
    });
    rootNode.append(chips);

    const picked = currentSlot();
    if (picked && picked.slot) {
      const durations = h('div', 'chip-row');
      C().durationChoices(picked.window).forEach((minutes) => {
        const btn = h('button', 'chip-btn' + (minutes === picked.duration ? ' on' : ''), minutes + ' min');
        btn.type = 'button';
        btn.onclick = () => { ui.duration = minutes; ui.slot = 0; renderScreen(); };
        durations.append(btn);
      });
      rootNode.append(durations);
      const times = h('div', 'chip-row');
      picked.slots.slice(0, 8).forEach((slot, index) => {
        const btn = h('button', 'chip-btn' + (slot.start === picked.slot.start ? ' on' : ''), C().formatRange(slot.start, slot.end));
        btn.type = 'button';
        btn.onclick = () => { ui.slot = index; renderScreen(); };
        times.append(btn);
      });
      rootNode.append(times);
    }

    rootNode.append(h('h3', 'cal-kicker', 'Where'));
    const spots = h('div', 'chip-row');
    C().mergeSpots(cal().spots).forEach((spot) => {
      const btn = h('button', 'chip-btn' + (spot.name === ui.spot ? ' on' : ''), spot.name);
      btn.type = 'button';
      btn.onclick = () => { ui.spot = spot.name; renderScreen(); };
      if (!spot.preset && spot.id) {
        const remove = h('button', 'chip-x', '×');
        remove.type = 'button';
        remove.setAttribute('aria-label', 'Remove ' + spot.name);
        remove.onclick = (event) => { event.stopPropagation(); api.removeSpot(spot.id).catch(fail); };
        btn.append(remove);
      }
      spots.append(btn);
    });
    rootNode.append(spots);
    const addSpot = h('form', 'inline-form');
    const spotInput = h('input');
    spotInput.placeholder = 'Add a favorite spot';
    spotInput.maxLength = 80;
    spotInput.setAttribute('aria-label', 'Favorite restaurant');
    const spotBtn = h('button', 'chip-btn', 'Save spot');
    spotBtn.type = 'submit';
    addSpot.append(spotInput, spotBtn);
    addSpot.onsubmit = (event) => {
      event.preventDefault();
      const name = C().normalizeSpot(spotInput.value);
      if (!name) return;
      ui.spot = name;
      api.addSpot(name).catch(fail);
    };
    rootNode.append(addSpot);

    const ride = h('input', 'wide-input');
    ride.placeholder = 'Ride note (optional) — I’ll drive, or meet there';
    ride.maxLength = 200;
    ride.value = ui.ride;
    ride.setAttribute('aria-label', 'Ride note');
    ride.oninput = () => { ui.ride = ride.value; };
    rootNode.append(ride);

    const propose = h('button', 'btn-primary cal-go', 'Propose Daily Restaurant Meetup');
    propose.type = 'button';
    propose.disabled = !picked || !picked.slot;
    propose.onclick = () => {
      if (!picked || !picked.slot) return;
      api.propose({
        day: ui.day,
        start: picked.slot.start,
        end: picked.slot.end,
        spot: ui.spot,
        ride: ui.ride,
      }).catch(fail);
    };
    rootNode.append(propose);
    const series = h('button', 'btn-row', 'Propose this spot for the next 7 days');
    series.type = 'button';
    series.onclick = () => {
      const plans = C().planDailyMeetups({
        shifts: cal().shifts,
        daysOff: cal().daysOff,
        meId: me.id,
        themId: other.id,
        startDay: ui.day,
        days: 7,
        spot: ui.spot,
        ride: ui.ride,
        duration: ui.duration,
      }).filter((plan) => !plan.skip);
      if (!plans.length) { api.toast('No shared openings in those 7 days.'); return; }
      api.proposeDays(plans).catch(fail);
    };
    rootNode.append(series);

    rootNode.append(h('h3', 'cal-kicker', 'My shifts'));
    const presets = h('div', 'chip-row');
    C().SHIFT_PRESETS.forEach((preset) => {
      const btn = h('button', 'chip-btn', preset.label + ' ' + C().formatRange(preset.start, preset.end));
      btn.type = 'button';
      btn.onclick = () => api.addShift({
        userId: me.id,
        weekday: C().weekdayOf(ui.day),
        date: null,
        start: preset.start,
        end: preset.end,
        label: preset.label,
      }).catch(fail);
      presets.append(btn);
    });
    rootNode.append(presets);

    const mine = cal().shifts.filter((shift) => shift.userId === me.id && (shift.date === ui.day || (!shift.date && shift.weekday === C().weekdayOf(ui.day))));
    mine.forEach((shift) => {
      const row = h('div', 'shift-edit');
      row.append(h('span', null, (shift.date ? 'This date · ' : 'Every ' + C().WEEKDAYS[shift.weekday] + ' · ') + shift.label + ' · ' + C().formatRange(shift.start, shift.end)));
      const del = h('button', 'chip-btn', 'Remove');
      del.type = 'button';
      del.onclick = () => api.deleteShift(shift.id).catch(fail);
      row.append(del);
      rootNode.append(row);
    });

    const form = h('form', 'inline-form');
    const start = h('input');
    start.type = 'time';
    start.value = '09:00';
    start.setAttribute('aria-label', 'Shift start');
    const end = h('input');
    end.type = 'time';
    end.value = '17:00';
    end.setAttribute('aria-label', 'Shift end');
    const label = h('input');
    label.placeholder = 'Label';
    label.value = 'Work';
    label.maxLength = 40;
    label.setAttribute('aria-label', 'Shift label');
    const saveWeek = h('button', 'chip-btn', 'Weekly');
    saveWeek.type = 'submit';
    const saveDate = h('button', 'chip-btn', 'This date');
    saveDate.type = 'button';
    form.append(start, end, label, saveWeek, saveDate);
    const readShift = () => ({
      userId: me.id,
      start: C().parseClock(start.value),
      end: C().parseClock(end.value),
      label: label.value,
    });
    form.onsubmit = (event) => {
      event.preventDefault();
      const shift = readShift();
      api.addShift({ ...shift, weekday: C().weekdayOf(ui.day), date: null }).catch(fail);
    };
    saveDate.onclick = () => {
      const shift = readShift();
      api.addShift({ ...shift, weekday: null, date: ui.day }).catch(fail);
    };
    rootNode.append(form);

    const off = cal().daysOff.some((row) => row.userId === me.id && row.date === ui.day);
    const offBtn = h('button', 'btn-row', off ? 'I’m working my usual shift this date' : 'I’m off this date');
    offBtn.type = 'button';
    offBtn.onclick = () => api.setDayOff(ui.day, !off).catch(fail);
    rootNode.append(offBtn);
  }

  function card(message) {
    const meetup = cal().meetups.find((row) => row.id === (message.meta && message.meta.meetup_id));
    const box = h('div', 'meetup-card');
    if (!meetup) {
      box.append(h('p', 'meetup-fallback', message.body || 'Daily Restaurant Meetup'));
      return box;
    }
    const locked = meetup.status === 'confirmed';
    box.append(h('div', 'meetup-kicker', locked ? 'Locked in' : meetup.status === 'cancelled' ? 'Cancelled' : 'Daily Restaurant Meetup'));
    box.append(h('div', 'meetup-spot', meetup.spot));
    box.append(h('div', 'meetup-when', C().formatDayLabel(meetup.day, today()) + ' · ' + C().formatRange(meetup.start, meetup.end)));
    if (meetup.ride) box.append(h('div', 'meetup-ride', meetup.ride));
    if (meetup.status === 'cancelled') return box;
    const actions = h('div', 'meetup-actions');
    if (C().canConfirm(meetup, api.me().id)) {
      const confirm = h('button', 'meetup-yes', 'Confirm');
      confirm.type = 'button';
      confirm.onclick = (event) => { event.stopPropagation(); api.confirm(meetup.id).catch(fail); };
      actions.append(confirm);
    } else if (meetup.status === 'proposed') {
      actions.append(h('span', 'meetup-wait', 'Waiting on a yes'));
    }
    if (locked) {
      const add = h('button', 'meetup-yes ghost', 'Add to calendar');
      add.type = 'button';
      add.onclick = (event) => { event.stopPropagation(); api.downloadIcs(meetup); };
      actions.append(add);
    }
    box.append(actions);
    if (!C().canCounter(meetup)) return box;
    const nudges = h('div', 'meetup-actions');
    C().TIME_DELTAS.forEach((delta) => {
      const label = (delta > 0 ? '+' : '−') + Math.abs(delta) + ' min';
      const btn = h('button', 'chip-btn', label);
      btn.type = 'button';
      btn.onclick = (event) => { event.stopPropagation(); api.counter(meetup.id, '', delta).catch(fail); };
      nudges.append(btn);
    });
    box.append(nudges);
    const spots = h('div', 'meetup-actions');
    C().otherSpots(cal().spots, meetup.spot).slice(0, 6).forEach((spot) => {
      const btn = h('button', 'chip-btn', spot.name);
      btn.type = 'button';
      btn.onclick = (event) => { event.stopPropagation(); api.counter(meetup.id, spot.name, null).catch(fail); };
      spots.append(btn);
    });
    box.append(h('div', 'chip-hint', 'Suggest a different spot'));
    box.append(spots);
    return box;
  }

  function open() {
    ui.anchor = ui.anchor || today();
    ui.day = ui.day || today();
    document.querySelector('#chat').classList.add('hidden');
    document.querySelector('#calendar').classList.remove('hidden');
    renderScreen();
  }

  function close() {
    document.querySelector('#calendar').classList.add('hidden');
    document.querySelector('#chat').classList.remove('hidden');
  }

  function init(next) {
    api = next;
    ui.anchor = today();
    ui.day = today();
    const openBtn = document.querySelector('#calendarBtn');
    if (openBtn) openBtn.onclick = open;
    const back = document.querySelector('#calendarBack');
    if (back) back.onclick = close;
    const banner = document.querySelector('#meetupBanner');
    if (banner) banner.onclick = open;
    renderBanner();
  }

  root.FlarmCalendarUI = {
    init,
    renderBanner,
    render: () => { renderBanner(); if (!document.querySelector('#calendar').classList.contains('hidden')) renderScreen(); },
    card,
    open,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
