import { Component, OnInit, ViewChild } from '@angular/core';
import { DataService } from '../../services';
import { BsModalService, ModalDirective } from 'ngx-bootstrap/modal';
import { BsModalRef } from 'ngx-bootstrap/modal/bs-modal-ref.service';
import { VideoplayerComponent } from '../modals/videoplayer/videoplayer.component';
import { AddcontentToSessionComponent } from '../modals/addcontent-to-session/addcontent-to-session.component';
import { ConfirmComponent } from '../modals/confirm/confirm.component';
import * as _ from 'lodash';
import { isUndefined } from 'util';

@Component({
  selector: 'app-sessions',
  templateUrl: './sessions.component.html',
  styleUrls: ['./sessions.component.css'],
  entryComponents: [VideoplayerComponent, AddcontentToSessionComponent]
})
export class SessionsComponent implements OnInit {

  @ViewChild(ModalDirective) modal: ModalDirective;

  filters = {
    tags: [],
    categories: [],
    skillLevel: ['Beginner', 'Intermediate', 'Expert']
  }

  selectedFilter = {
    tag: '',
    category: '',
    skillLevel: ''
  }

  sessions = [];
  freeSessions = [];
  customSessions = [];

  banner = {
    isActive: false,
    timer: undefined,
    count: 0,
    sessionId: undefined,
    defaultTimeout: 1000 * 60
  };



  bsModalRef: BsModalRef;

  ngOnInit() {
  }

  hasFilter() {
    return this.selectedFilter.tag != '' || this.selectedFilter.category != '' || this.selectedFilter.skillLevel != '';
  }

  clearFilter() {
    this.selectedFilter = {
      tag: '',
      category: '',
      skillLevel: ''
    }
  }

  getFilteredSessions() {
    if (this.hasFilter()) {
      let clone = _.cloneDeep(this.sessions);
      let filtered = clone.filter(session => {
        let tag = this.selectedFilter.tag;
        let category = this.selectedFilter.category;

        if (tag) {
          session.content = session.content.filter(f => {
            return f.tags && f.tags.indexOf(tag) != -1;
          });
        }
        session.chunks.length = 0;
        session.chunks = this.getChunks(session.content, 3);

        session.display.length = 0;
        session.display.push(...session.chunks);
        if (category) {
          return session.name === this.selectedFilter.category;
        }
        return true;
      });
      return filtered;
    }
    return this.sessions;
  }

  constructor(private dataService: DataService, private modalService: BsModalService) {
    this.getFreeSessions();
    this.getSessions();
  }

  selectTag(tag) {
    this.selectedFilter.tag = tag;
  }

  closeBanner() {
    this.banner = {
      isActive: false,
      timer: undefined,
      count: 0,
      sessionId: undefined,
      defaultTimeout: 1000 * 60
    };
  }

  showBanner(sessionId) {
    this.banner.isActive = true;
    this.banner.sessionId = sessionId;

    if (this.banner.sessionId !== sessionId) {
      this.banner.count = 0;
    } else {
      this.banner.count++;
    }

    if (this.banner.timer) clearTimeout(this.banner.timer);

    this.banner.timer = setTimeout(() => {
      this.closeBanner();
    }, this.banner.defaultTimeout);
  }

  addContentToCustomSession(contentId, content) {
    // prompt user to select which existing session they want to add
    // this content to, or let them start a new session
    const initialState = {
      customSession: this.customSessions
    };
    this.bsModalRef = this.modalService.show(AddcontentToSessionComponent, { initialState, class: 'modal-lg' });
    this.bsModalRef.content.closeBtnName = 'Close';
    this.bsModalRef.content.onClose.subscribe(result => {
      if (result && result.type === 'new') {
        this.newSession(result.name, contentId);
      } else if (result && result.type === 'add') {
        this.addToExistingSession(result.id, contentId, content);
      }
    });
  }

  newSession(name, contentId) {
    if (!name || !contentId) return;

    let newSession = {
      name: name,
      content: [contentId]
    }

    this.save(newSession, response => {
      this.getSessions();
      if (response && response.id) {
        this.showBanner(response.id);
      }
    });
  }

  addToExistingSession(id, contentId, content) {
    if (!id) return;

    let existing = this.customSessions.find((session) => {
      return session.id === id;
    });

    let f = _.cloneDeep(existing);
    let arr = [];

    f.content.forEach(e => {
      arr.push(e.id);
    });
    if (arr.indexOf(contentId) === -1) {
      arr.push(contentId);
      f.content = arr;
      if (content) existing.content.push(content);
      this.save(f, (response) => {
        if (response && response.id) {
          this.showBanner(response.id);
        }
      });
    }
  }

  editSession(session) {
    if (!session) return;

    let sesionToSave = _.cloneDeep(session);
    sesionToSave.content = this.flatContent(sesionToSave.content);

    this.save(sesionToSave, (response) => {
      session.editMode = false;
    });
  }

  revertEdit(session) {
    if (!session) return;

    session.name = session.oldName;
    session.editMode = false;
  }

  removeFromSession(session, index) {
    if (!session || session.content.length < 1 || isUndefined(index)) return;

    const params = {
      title: 'Delete Session',
      message: 'Are you sure you want to delete this session?',
      cancelLabel: 'Back',
      confirmLabel: 'Confirm'
    };

    let confirmModal = this.modalService.show(ConfirmComponent, { initialState: params, class: 'modal-sm' });
    confirmModal.content.onClose.subscribe(result => {
      if (result.confirm) {
        if (session.content.length == 1) {
          this.deleteUserSession(session.id); //Delete session if this is the last video in it
          return;
        }

        session.content.splice(index, 1);
        let sesionToSave = _.cloneDeep(session);
        sesionToSave.content = this.flatContent(sesionToSave.content);

        this.save(sesionToSave);
      }
    });
  }

  flatContent(content) {
    if (!content) return;
    return content.map(e => e.id);
  }

  toggleSessionDetails(session) {
    if (!session) return;
    session.expanded = !session.expanded ? true : false;
  }

  toggleSessionEdit(session) {
    if (!session) return;
    session.oldName = session.name;
    session.editMode = !session.editMode ? true : false;
    session.expanded = false;
  }

  save(session, cb = null) {
    this.dataService.saveSessions(session).subscribe((response) => {
      if (cb) {
        cb(response);
      }
      if (!response || !response.success) {
        console.error('Custom session failed to save!');
        return;
      }
    });
  }

  selectCategory(category) {
    this.selectedFilter.category = category;
  }

  selectSkillLevel(skillLevel) {
    this.selectedFilter.skillLevel = skillLevel;
  }

  deleteUserSession(sessionId) {
    // console.log('deleting custom session', sessionId);
    const params = {
      title: 'Delete Session',
      message: 'Are you sure you want to delete this session?',
      cancelLabel: 'Back',
      confirmLabel: 'Confirm'
    };

    let confirmModal = this.modalService.show(ConfirmComponent, { initialState: params, class: 'modal-sm' });
    confirmModal.content.onClose.subscribe(result => {
      if (result.confirm) {
        this.dataService.deleteSessions(sessionId).subscribe((response) => {
          if (!response || !response.success) {
            // console.error('Could not delete session');
            return;
          }
          this.getSessions();
        });
      }
    });
  }

  collectTagsAndCategories(contentList) {
    let tags = this.filters.tags;
    let categories = this.filters.categories;

    for (let content of contentList) {
      categories.push(content.group);
      if (content.tags) tags.push(...content.tags);
    }

    this.filters.tags = tags.filter(function (value, index, self) {
      return self.indexOf(value) === index;
    });

    this.filters.categories = categories.filter(function (value, index, self) {
      return self.indexOf(value) === index;
    });
  }

  getSessions(cache: boolean = false) {
    this.dataService.getSessions(cache).subscribe((response) => {
      if (!response.success) return;
      this.sessions = [];
      this.customSessions = [];

      this.collectTagsAndCategories(response.content);
      this.groupContent(response.content, this.sessions);
      this.customSessions.push(...response.plans);
    });
  }

  getFreeSessions() {
    this.dataService.getFreeSessions().subscribe((response) => {
      if (!response.success) return;

      this.freeSessions = [];
      //this.collectTagsAndCategories(response.content);
      this.groupContent(response.content, this.freeSessions);
    });
  }

  groupContent(contentList, fill) {
    let sessions = {};

    for (let content of contentList) {
      if (sessions[content.group]) {
        sessions[content.group].content.push(content);
        sessions[content.group].defaultView = content.defaultView ? content.defaultView : 3
      } else {
        sessions[content.group] = {
          content: [content],
          defaultView: content.defaultView ? content.defaultView : 3
        }
      }
    }

    for (var session in sessions) {
      if (!sessions.hasOwnProperty(session)) continue;

      var contents = sessions[session];
      var chunks = this.getChunks(contents.content, 3);
      var defaultView = contents.defaultView ;

      fill.push({
        name: session,
        display: [],
        content: contents.content,
        defaultView: defaultView,
        chunks: chunks || []
      });
    }
  }

  showMore(session) {
    if (session && session.chunks.length > 0) {
      session.display.push(session.chunks.shift());

      if (session.display.length == 1 && session.chunks.length > 0) {
        session.display.push(session.chunks.shift());
      }
    }
  }

  showLess(session) {
    if (session && session.display) {
      while (session.display.length) {
        session.chunks.unshift(session.display.pop());
      }
    }
  }

  getChunks(arr, len) {
    if (arr && arr.length > 0) {
      var chunks = [],
            i = 0,
            n = arr.length;

        while (i < n) {
          chunks.push(arr.slice(i, i += len));
        }

        return chunks;
    }
  }

  startSessionById(sessionId) {
    this.closeBanner();
    let session = this.customSessions.find((session) => {
      return session.id === sessionId;
    });
    this.startSession(session);
  }

  startSession(session, index = 0) {
    this.openModalWithComponent(session, index, true);
  }

  openModalWithContent(session, contentId) {
    let index;
    session.content.find((element, i) => {
      if (element.id == contentId) {
        index = i;
      }
    });
    this.openModalWithComponent(session, index)
  }

  openModalWithComponent(session, selectedIndex: number = 0, userCreated = false) {
    const initialState = {
      session,
      selectedIndex,
      userCreated
    };
    this.bsModalRef = this.modalService.show(VideoplayerComponent, { initialState, class: 'modal-lg' });
    this.bsModalRef.content.closeBtnName = 'Close';
  }
}
