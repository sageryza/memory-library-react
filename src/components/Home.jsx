import { Link } from 'react-router-dom';
import LibraryIcon from './shared/LibraryIcon';
import './Home.css';

function Home() {
  return (
    <div className="home-container">
      <header className="home-header">
        <div className="header-content">
          <h1>Memory Library</h1>
          <p className="subtitle">tools for the mind</p>
        </div>
      </header>

      <main className="modules-grid">
        {/* Archive Module */}
        <Link to="/archive" className="module-card" data-module="archive">
          <div className="module-icon">
            <div className="archive-icon">
              <div className="bookshelf">
                <div className="book book1"></div>
                <div className="book book2"></div>
                <div className="book book3"></div>
                <div className="book book4"></div>
              </div>
            </div>
          </div>
          <h3>Archive</h3>
          <p>Browse all memories in a searchable, filterable library. Perfect for finding specific moments or themes.</p>
          <div className="module-features">
            <span className="feature">Search</span>
            <span className="feature">Filter</span>
            <span className="feature">Browse</span>
          </div>
          <button className="launch-btn">Launch Archive</button>
        </Link>

        {/* Conspiracy Board Module */}
        <Link to="/conspiracy-board" className="module-card" data-module="conspiracy">
          <div className="module-icon">
            <div className="conspiracy-icon">
              <div className="pushpin">
                <div className="pin-head"></div>
                <div className="pin-body"></div>
                <div className="pin-shadow"></div>
              </div>
            </div>
          </div>
          <h3>Conspiracy Board</h3>
          <p>Connect the dots with notes and red strings on a corkboard. Build webs of connections, theories, and revelations.</p>
          <div className="module-features">
            <span className="feature">Pin & Connect</span>
            <span className="feature">Red Strings</span>
            <span className="feature">Visual Links</span>
          </div>
          <button className="launch-btn">Launch Conspiracy Board</button>
        </Link>

        {/* Chronology Module */}
        <Link to="/chronology" className="module-card" data-module="timeline">
          <div className="module-icon">
            <div className="timeline-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 393.04 545.92" width="60" height="60">
                <path fill="#800020" d="M381.55,501.79c7.47,2.16,11.39,7.23,11.46,15.95,.04,4.33,.05,8.67-.02,13-.17,9.41-5.97,15.18-15.33,15.18-120.81,0-241.63,0-362.44-.02-8.24,0-13.79-3.91-14.69-11.81-.77-6.69-.16-13.58,.34-20.34,.37-5.03,3.53-9.06,8.05-10.56,5.12-1.7,5.51-5.17,6.03-9.39,1.51-12.33,2.81-24.72,5.01-36.94,6.51-36.15,21.44-68.77,42.38-98.79,17.42-24.97,38.84-46.43,59.57-68.51,3.17-3.38,6.26-6.95,8.75-10.85,4.98-7.8,4.94-13.47-1.1-20.56-8.19-9.62-16.9-18.83-25.72-27.88-26.7-27.41-50.68-56.76-66.96-91.77-12.14-26.11-19.09-53.58-21.92-82.16-.26-2.64-.38-5.34-1.05-7.89-.34-1.3-1.55-2.88-2.75-3.36C3.87,42.18,.31,37.51,.07,29.61c-.13-4.33-.03-8.66,0-13C.15,5.76,5.93,0,16.73,0c40.66,0,81.32,0,121.98,0,79.15,0,158.31,0,237.46,0,9.22,0,14.89,3.14,15.97,10.95,1.08,7.76,.96,15.96-.36,23.67-.63,3.65-4.77,7.46-8.28,9.61-3.05,1.87-4.21,3.7-4.46,6.88-2.27,29.13-8.68,57.29-20.48,84.06-9.63,21.85-22.01,42.18-37.71,60.15-17.85,20.43-36.58,40.08-54.92,60.08-8.49,9.26-8.95,18.12-.53,27.42,11.18,12.33,22.79,24.27,34.33,36.27,34.22,35.58,60.1,76.07,71.54,124.58,4.43,18.81,6.81,38.11,10.29,58.11Zm-38.41-1.04c-2.28-14.48-4.01-28.44-6.74-42.2-8.62-43.47-30.72-79.78-60.25-112.11-12.46-13.64-24.69-27.49-36.59-41.62-8.6-10.2-14.39-21.85-14.55-35.66-.17-14.29,6.15-26.12,14.95-36.52,14.61-17.28,29.93-33.96,44.81-51.01,24.39-27.92,42.78-59.11,50.73-95.7,2.79-12.87,4.64-25.94,6.99-39.34H52.3c-.63,9.25,4.95,39.19,9.43,53.54,10.37,33.23,29.81,60.91,52.52,86.6,13.56,15.34,27.62,30.24,40.83,45.86,18.42,21.79,18.74,47.12,.69,69.01-14.92,18.09-30.81,35.39-46.11,53.17-13.91,16.18-26.26,33.44-35.69,52.69-10.37,21.17-16.27,43.68-19.83,66.84-1.33,8.63-1.85,17.38-2.77,26.44H343.14Z"/>
                <path fill="#800020" d="M299.39,133.89c-3.73,5.26-6.59,10.12-10.23,14.29-17.74,20.31-35.54,40.56-53.6,60.58-16.8,18.61-28.91,39.61-34.31,64.24-.42,1.92-.34,3.97-.3,5.96,.28,13.14,.73,26.28,.9,39.42,.15,11.94,6.78,20.26,14.48,28.47,18.11,19.3,36.21,38.65,53.52,58.66,16.82,19.44,30.6,40.94,38.99,65.52,.8,2.35,1.66,4.71,2.11,7.13,.42,2.27,.32,4.64,.47,7.35H82.35c.74-4.43,.9-8.78,2.22-12.76,7.78-23.55,20.91-44.11,36.98-62.69,19.07-22.03,38.71-43.58,58.38-65.08,5.64-6.17,9.16-13.3,10.61-21.11,2.03-10.93,3.18-22.07,3.96-33.18,1.15-16.53-4.49-31.7-10.94-46.5-6.39-14.66-16.42-26.86-27.17-38.52-19.51-21.17-39.63-41.82-56.45-65.32-1.34-1.87-2.49-3.87-4.14-6.46h203.59Z"/>
              </svg>
            </div>
          </div>
          <h3>Chronology</h3>
          <p>Organize memories chronologically on an interactive timeline. Drag and drop events, explore connections over time.</p>
          <div className="module-features">
            <span className="feature">Chronological</span>
            <span className="feature">Drag & Drop</span>
            <span className="feature">Interactive</span>
          </div>
          <button className="launch-btn">Launch Chronology</button>
        </Link>

        {/* Libraries Module */}
        <Link to="/libraries" className="module-card" data-module="libraries">
          <div className="module-icon">
            <div className="library-icon">
              <LibraryIcon size={60} />
            </div>
          </div>
          <h3>Libraries</h3>
          <p>Discover patterns and clusters in your connected memories. Explore constellations of related thoughts and ideas.</p>
          <div className="module-features">
            <span className="feature">Pattern Discovery</span>
            <span className="feature">Memory Clusters</span>
            <span className="feature">Collections</span>
          </div>
          <button className="launch-btn">Launch Libraries</button>
        </Link>

        {/* Lessons Module */}
        <div className="module-card coming-soon" data-module="lessons">
          <div className="module-icon">
            <div className="lessons-icon">
              <div className="book-open">
                <div className="page-left"></div>
                <div className="page-right">
                  <div className="text-line"></div>
                  <div className="text-line"></div>
                  <div className="text-line"></div>
                </div>
                <div className="book-spine"></div>
              </div>
            </div>
          </div>
          <h3>Lessons</h3>
          <p>Guided exercises and lessons to help you explore memory patterns, understand recall, and develop new perspectives.</p>
          <div className="module-features">
            <span className="feature">Guided Learning</span>
            <span className="feature">Memory Exercises</span>
            <span className="feature">Pattern Discovery</span>
          </div>
          <button className="launch-btn coming-soon" disabled>Coming Soon</button>
        </div>
      </main>
    </div>
  );
}

export default Home;
